const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const generativeText = async (prompt) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-001" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = await response.text();
    return text;
  } catch (error) {
    console.error("💥 Error generating text:", error); // more helpful
    throw error;
  }
};

module.exports = generativeText;
