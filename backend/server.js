import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
dotenv.config();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5435;

/* ===========================
   GEMINI SETUP
=========================== */

let genAI = null;

if (process.env.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

/* ===========================
   SMART LOCAL AI FALLBACK
=========================== */

function extractField(prompt, label) {
  const regex = new RegExp(label + ":(.*)", "i");
  const match = prompt.match(regex);
  return match ? match[1].trim() : "";
}

function localResumeAI(prompt) {
  const name = extractField(prompt, "Name") || "Your Name";
  const role = extractField(prompt, "Role") || "Professional Candidate";
  const skills = extractField(prompt, "Skills") || "Communication, Leadership";
  const projects = extractField(prompt, "Projects") || "Personal Projects";
  const experience =
    extractField(prompt, "Experience") || "Relevant internship experience";
  const goal = extractField(prompt, "Goal") || "career growth";

  return {
    name,
    summary: `${role} with strong knowledge of ${skills}. Passionate about ${goal} and delivering high-quality results.`,
    skills,
    projects,
    experience,
  };
}

/* ===========================
   ROUTES
=========================== */

app.get("/", (req, res) => {
  res.send("Unlimited AI Resume Backend Running 🚀");
});

app.post("/generate", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt required",
      });
    }

    /* ======================
       TRY GEMINI FIRST
    ====================== */

    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({
          model: "gemini-1.5-flash",
        });

        const result = await model.generateContent(`
Create a professional ATS-friendly resume from this:

${prompt}

Return ONLY raw JSON:
{
"name":"",
"summary":"",
"skills":"",
"projects":"",
"experience":""
}
`);

        const text = result.response.text();

        return res.json({
          text,
          source: "Gemini AI",
        });
      } catch (geminiError) {
        console.log("Gemini failed. Switching to local AI...");
      }
    }

    /* ======================
       FALLBACK LOCAL AI
    ====================== */

    const fallback = localResumeAI(prompt);

    res.json({
      text: JSON.stringify(fallback),
      source: "Local Unlimited AI",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Resume generation failed",
    });
  }
});
app.post("/ats", (req, res) => {
  try {
    const { resume, job } = req.body;

    if (!resume || !job) {
      return res.json({
        result: "Please fill resume and job description."
      });
    }

    const resumeText = resume.toLowerCase();
    const jobText = job.toLowerCase();

    const keywords = jobText.match(/\b[a-zA-Z]+\b/g) || [];

    const unique = [...new Set(keywords)].filter(word => word.length > 3);

    let matched = [];
    let missing = [];

    unique.forEach(word => {
      if (resumeText.includes(word)) {
        matched.push(word);
      } else {
        missing.push(word);
      }
    });

    let score = Math.round((matched.length / unique.length) * 100);

    if (isNaN(score)) score = 0;

    res.json({
      result:
`ATS Score: ${score}/100

Matched Keywords:
${matched.slice(0,8).join(", ")}

Missing Keywords:
${missing.slice(0,8).join(", ")}

Suggestions:
• Add missing keywords
• Add measurable achievements
• Keep resume ATS friendly`
    });

  } catch (error) {
    console.log(error);

    res.json({
      result: "ATS checker failed"
    });
  }
});
/* ===========================
   START SERVER
=========================== */
app.post("/analyze-section", async (req, res) => {
  try {
    const { sectionName, sectionText } = req.body;

    if (!sectionText || sectionText.trim() === "") {
      return res.status(400).json({ error: "No text provided" });
    }

    const prompt = `Rewrite this ${sectionName} section of a resume to be grammatically correct, professional, unbiased, and honest. Remove any exaggerated claims. Keep the meaning intact. Return only the rewritten paragraph, nothing else.

Text: ${sectionText}`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }]
    });

    const rewritten = completion.choices[0].message.content;

    res.json({ rewritten });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Analysis failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});