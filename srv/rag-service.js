const cds = require("@sap/cds");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const { v4: uuid } = require("uuid");

module.exports = cds.service.impl(async function () {
  const db = await cds.connect.to("db");
  const { Documents } = this.entities;

 

  
//===============================================================================================================

  this.on("upload", async (req) => {
    const { file, mimeType } = req.data;
    if (!file) return req.error(400, "No file uploaded");

    try {
      // ------- A) Extract text from audio/video --------
      const extractModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const extract = await extractModel.generateContent([
        {
          inlineData: {
            mimeType,
            data: file.toString("base64")
          }
        },
        { text: "Transcribe or fully describe this media." }
      ]);

      const extractedText = extract.response.text();

      // ------- B) Generate text embedding (768 dims) ----
      const embed = await genAI
        .getGenerativeModel({ model: "text-embedding-004" })
        .embedContent(extractedText);

      const vector = embed.embedding.values;

      if (!vector || vector.length !== 768) {
        console.error("Embedding size incorrect:", vector?.length);
        return req.error(500, "Invalid embedding size (expected 768)");
      }

      const vecJson = JSON.stringify(vector);
      const escapedText = extractedText.replace(/'/g, "''");
      const escapedJson = vecJson.replace(/'/g, "''");
      const ID = uuid();

      // ------- C) Insert using INLINE SQL (no params!) ---
      const sql = `
        INSERT INTO RAG_DOCUMENTS
          (ID, source, text, embeddingJson, embeddingVec, createdAt)
        VALUES (
          '${ID}',
          '${mimeType}',
          '${escapedText}',
          '${escapedJson}',
          TO_REAL_VECTOR('${escapedJson}'),
          CURRENT_TIMESTAMP
        )
      `;

      await cds.db.run(sql);

      return `File processed & stored with ID: ${ID}`;

    } catch (err) {
      console.error("UPLOAD ERROR:", err);
      return req.error(500, err.message);
    }
  });

  // =====================================================
  // 2) QUERY (RAG)
  // =====================================================
  this.on("query", async (req) => {
    const { text, top = 3 } = req.data;

    if (!text) return req.error(400, "Text is required");

    try {
      // -------- A) Embed user query -----------
      const embed = await genAI
        .getGenerativeModel({ model: "text-embedding-004" })
        .embedContent(text);

      const qVec = JSON.stringify(embed.embedding.values).replace(/'/g, "''");

      // -------- B) Vector search (NO params in TO_REAL_VECTOR!) ---
      const sql = `
        SELECT TOP ${top}
          text,
          COSINE_SIMILARITY(
            embeddingVec,
            TO_REAL_VECTOR('${qVec}')
          ) AS score
        FROM RAG_DOCUMENTS
        ORDER BY score DESC
      `;

      const rows = await cds.db.run(sql);

      if (!rows.length) {
        return "No matching documents found.";
      }

      const context = rows.map(r => r.TEXT).join("\n\n");

      // -------- C) Ask Gemini with RAG ----------
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash"
      });

      const prompt = `
Use ONLY the following context to answer:

CONTEXT:
${context}

QUESTION:
${text}

If answer is not in context, reply: "Information not found in uploaded data."
      `;

      const answer = await model.generateContent([{ text: prompt }]);

      return answer.response.text();

    } catch (err) {
      console.error("QUERY ERROR:", err);
      return req.error(500, err.message);
    }
  });

 


});
