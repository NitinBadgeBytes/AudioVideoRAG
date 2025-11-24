using rag from '../db/schema';

service RAGService {
  entity Documents as projection on rag.Documents excluding { embeddingVec };
    //entity Documents as projection on rag.Documents;
  action upload(file : LargeBinary, mimeType : String) returns String;
  action query(text : String) returns String;
}