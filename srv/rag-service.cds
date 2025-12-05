using rag from '../db/schema';

service RAGService {
  entity Documents as projection on rag.Documents excluding { embeddingVec };
  entity RAG_DOCUMENTS_V2 as projection on rag.RAG_DOCUMENTS_V2 excluding { embeddingVec };
    //entity Documents as projection on rag.Documents;
  action upload(file : LargeBinary, mimeType : String) returns String;
  action query(text : String) returns String;
  function getLatestSummary() returns LargeString;
}