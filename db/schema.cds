namespace rag;

entity Documents {
  key ID        : UUID;
  source        : String(100);    
  text          : LargeString;    
  summary       : LargeString;   //new 25-11-2025
  //embeddingJson : LargeString;    
  embeddingVec  : Vector(768);   

  createdAt     : Timestamp;
}

entity RAG_DOCUMENTS_V2 {
  key ID           : UUID;
  source           : String;
  text             : LargeString;
  summary          : LargeString;
  embeddingVec     : Vector(3072);
  createdAt        : Timestamp;
}
