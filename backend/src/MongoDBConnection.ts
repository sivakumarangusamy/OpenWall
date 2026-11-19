import { DurableObject } from "cloudflare:workers";
import mongoose, { Schema } from "mongoose";

interface Env {
  MONGODB_URI: string;
}

const messageSchema = new Schema(
  {
    author: {
      type: String,
      trim: true,
      maxlength: 30,
      default: "Anonymous"
    },
    content: {
      type: String,
      required: true,
      maxlength: 20000
    },
    type: {
      type: String,
      enum: ["text", "code"],
      default: "text"
    },
    language: {
      type: String,
      default: "plaintext",
      maxlength: 30
    },
    expireAt: {
      type: Date,
      required: true
    }
  },
  { timestamps: true }
);

messageSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

const Message =
  mongoose.models.Message ||
  mongoose.model("Message", messageSchema);

// Convert BSON and Mongoose values into plain JSON-safe values.
function serializeMessage(message: any) {
  return {
    _id: String(message._id),
    author: message.author,
    content: message.content,
    type: message.type,
    language: message.language,
    expireAt: new Date(message.expireAt).toISOString(),
    createdAt: new Date(message.createdAt).toISOString(),
    updatedAt: new Date(message.updatedAt).toISOString()
  };
}

export class MongoDBConnection extends DurableObject<Env> {
  private connectionPromise?: Promise<typeof mongoose>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  private async connectDatabase() {
    if (mongoose.connection.readyState === 1) {
      return mongoose;
    }

    if (!this.connectionPromise) {
      this.connectionPromise = mongoose.connect(this.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: 1,
        minPoolSize: 0
      }).catch((error) => {
        this.connectionPromise = undefined;
        throw error;
      });
    }

    return this.connectionPromise;
  }

  async ping() {
    await this.connectDatabase();

    const result = await mongoose.connection.db!.admin().ping();

    return {
      success: true,
      database: mongoose.connection.name,
      ping: result.ok
    };
  }

  async listMessages() {
    await this.connectDatabase();

    const messages = await Message.find({
      expireAt: { $gt: new Date() }
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return messages.map(serializeMessage);
  }

  async createMessage(data: {
    author: string;
    content: string;
    type: "text" | "code";
    language: string;
  }) {
    await this.connectDatabase();

    const message = await Message.create({
      ...data,
      expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    return serializeMessage(message.toObject());
  }
}
