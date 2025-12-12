const cds = require("@sap/cds");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const OpenAI = require("openai");
const openai = new OpenAI({
  //apiKey: process.env.OPENAI_API_KEY,
  apiKey:''
});
const { v4: uuid } = require("uuid");
const { createClient } = require("@deepgram/sdk");
const deepgram = createClient('');
const { Readable } = require("stream");  
module.exports = cds.service.impl(async function () {
  const db = await cds.connect.to("db");
  //const { Documents } = this.entities;
  const {RAG_DOCUMENTS_V2} = this.entities;



//  new try ----------------------------------------------openai and gemini
// --------------------------------------------------------------
  // UPLOAD: Transcribe → Summarize → Embed → Store (Vector 3072)
  // --------------------------------------------------------------
// this.on("upload", async (req) => {
//   const { file, mimeType } = req.data;
//   if (!file) return req.error(400, "No file uploaded");

//   try {
//     // ==========================================================
//     // 1) TRANSCRIBE USING GEMINI
//     // ==========================================================
//     const gemModel = genAI.getGenerativeModel({
//       model: "gemini-2.0-flash"
//     });

//     const extractResp = await gemModel.generateContent([
//       {
//         inlineData: {
//           mimeType,
//           data: file.toString("base64")
//         }
//       },
//       { text: "Transcribe this media." }
//     ]);

//     const extractedText = extractResp.response.text();
//     const escapedText = extractedText.replace(/'/g, "''");

//     // ==========================================================
//     // 2) SUMMARY USING OPENAI
//     // ==========================================================
//     const summaryResp = await openai.chat.completions.create({
//       model: "gpt-4o-mini",
//       messages: [
//         {
//           role: "user",
//           content: `Summarize in 5 bullet points:\n${extractedText}`
//         }
//       ]
//     });

//     const summary = summaryResp.choices[0].message.content.replace(/'/g, "''");

//     // ==========================================================
//     // 3) EMBEDDING USING OPENAI (3072-d)
//     // ==========================================================
//     const embResp = await openai.embeddings.create({
//       model: "text-embedding-3-large", // 3072 dimensions
//       input: extractedText
//     });

//     const embeddingArray = embResp.data[0].embedding; // JS array
//     const vecJson = JSON.stringify(embeddingArray).replace(/'/g, "''");

//     // ==========================================================
//     // 4) INSERT RECORD INTO HANA (REAL_VECTOR(3072))
//     // ==========================================================
//     const ID = uuid();

//     const sql = `
//       INSERT INTO RAG_RAG_DOCUMENTS_V2 
//       (ID, source, text, summary, embeddingVec, createdAt)
//       VALUES (
//         '${ID}',
//         '${mimeType}',
//         '${escapedText}',
//         '${summary}',
//         TO_REAL_VECTOR('${vecJson}'),
//         CURRENT_TIMESTAMP
//       )
//     `;

//     await cds.db.run(sql);

//     return `Upload successful. ID = ${ID}`;

//   } catch (err) {
//     console.error("UPLOAD ERROR:", err);
//     return req.error(500, err.message);
//   }
// });

   //with deepgram api for the transcription
 this.on("upload", async (req) => {
    const { file, mimeType } = req.data;
    if (!file) return req.error(400, "No file uploaded");
    if (!mimeType) return req.error(400, "mimeType missing");

    try {
      console.log("========== STARTING UPLOAD ==========");
      console.log("MimeType:", mimeType);

      // ======================================================
      // 1️ ENSURE FILE IS RAW BINARY BUFFER (CRITICAL FIX)
      // ======================================================
      const audioBuffer = Buffer.isBuffer(file)
        ? file
        : Buffer.from(file, "base64");

      // ======================================================
      // 2️ DEEPGRAM v3 TRANSCRIPTION (CORRECT API)
      // ======================================================
      console.log("Deepgram: Transcribing media...");

      const { result, error } =
        await deepgram.listen.prerecorded.transcribeFile(
          audioBuffer,
          {
            model: "nova",
            smart_format: true,
            mimetype: mimeType   //  REQUIRED
          }
        );

      if (error) {
        console.error("Deepgram Error:", error);
        return req.error(500, "Deepgram transcription failed");
      }

      const extractedText =
        result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

      console.log("Transcript:", extractedText);

      if (!extractedText) {
        return req.error(400, "No speech detected in media");
      }

      // ======================================================
      // 3️ OPENAI SUMMARY
      // ======================================================
      console.log("OpenAI: Generating summary...");

      const summaryResp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: `Summarize this in 5 bullet points:\n${extractedText}`
        }]
      });

      const summary =
        summaryResp.choices[0].message.content;

      // ======================================================
      // 4️OPENAI EMBEDDING (3072 DIMENSIONS)
      // ======================================================
      console.log("OpenAI: Generating embedding...");

      const embResp = await openai.embeddings.create({
        model: "text-embedding-3-large",
        input: extractedText
      });

      const embeddingVec = JSON.stringify(
        embResp.data[0].embedding
      );

      // ======================================================
      // 5️ INSERT INTO SAP HANA VECTOR TABLE
      // ======================================================
      console.log("HANA: Inserting record...");

      const ID = uuid();

      const sql = `
        INSERT INTO RAG_RAG_DOCUMENTS_V2
        (ID, source, text, summary, embeddingVec, createdAt)
        VALUES (
          '${ID}',
          '${mimeType}',
          '${extractedText.replace(/'/g, "''")}',
          '${summary.replace(/'/g, "''")}',
          TO_REAL_VECTOR('${embeddingVec}'),
          CURRENT_TIMESTAMP
        )
      `;

      await cds.db.run(sql);

      console.log("Upload Completed:", ID);
      console.log("========== FINISHED ==========");

      return {
        message: "Upload successful",
        id: ID,
        text: extractedText,
        summary
      };

    } catch (err) {
      console.error("UPLOAD ERROR:", err);
      return req.error(500, err.message);
    }
  });


// ============================================================
// 2) QUERY: OpenAI Embeddings + HANA Similarity + GPT Answer
// ============================================================
this.on("query", async (req) => {
  const { text, top = 3 } = req.data;
  if (!text) return req.error(400, "Text is required");

  try {
    // A) Create 3072-d embedding using OpenAI
    const embedResp = await openai.embeddings.create({
      model: "text-embedding-3-large",
      input: text,
    });

    const qVec = JSON.stringify(embedResp.data[0].embedding)
      .replace(/'/g, "''");

    // B) HANA similarity search using CARDINALITY()
    const sql = `
      SELECT TOP ${top}
        TEXT,
        COSINE_SIMILARITY(
          EMBEDDINGVEC,
          TO_REAL_VECTOR('${qVec}')
        ) AS SCORE
      FROM RAG_RAG_DOCUMENTS_V2
      ORDER BY SCORE DESC
    `;

    const rows = await cds.db.run(sql);
    if (!rows.length) return "No matching documents found.";

    const context = rows.map(r => r.TEXT).join("\n\n");

    // C) Generate final answer using GPT
    const prompt = `
Use ONLY the provided context to answer.

CONTEXT:
${context}

QUESTION:
${text}

If the answer is not in the context, say:
"Information not found in uploaded data."
    `;

    const answerResp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    return answerResp.choices[0].message.content;

  } catch (err) {
    console.error("QUERY ERROR:", err);
    return req.error(500, err.message);
  }
});

  // ============================================================
  // 3) GET SUMMARY OF LAST UPLOADED DOCUMENT
  // ============================================================
  this.on("getLatestSummary", async (req) => {
  try {
    const sql = `
      SELECT TOP 1 summary
      FROM RAG_RAG_DOCUMENTS_V2
      ORDER BY createdAt DESC
    `;

    const rows = await cds.db.run(sql);
    if (!rows.length) return "No document uploaded yet.";

    let summary = rows[0].SUMMARY;

    if (Buffer.isBuffer(summary)) {
      summary = summary.toString("utf8");
    }

    return summary;

  } catch (err) {
    console.error("SUMMARY ERROR:", err);
    return req.error(500, err.message);
  }
});



});
