import mongoose, { Schema } from "mongoose";

const messageSchema = new Schema(
  {
    author: {
      type: String,
      trim: true,
      maxlength: 30,
      default: "Anonymous",
    },
    content: {
      type: String,
      required: true,
      maxlength: 20000,
    },
    type: {
      type: String,
      enum: ["text", "code"],
      default: "text",
    },
    language: {
      type: String,
      default: "plaintext",
      maxlength: 30,
    },
    expireAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// MongoDB automatically removes expired documents.
messageSchema.index(
  { expireAt: 1 },
  { expireAfterSeconds: 0 }
);

export default mongoose.model("Message", messageSchema);
