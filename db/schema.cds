namespace rag;

entity Documents {
  key ID        : UUID;
  source        : String(100);     // audio/video mime type
  text          : LargeString;     // extracted transcript or description

  embeddingJson : LargeString;     // JSON of 3072 floats
  embeddingVec  : Vector(768);   // REAL vector for HANA search

  createdAt     : Timestamp;
}