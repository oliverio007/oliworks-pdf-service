

// OliWorks/production/index.ts

export * from "./rules";
import { handleAskProject } from "./handleAskProject";

export async function ask({ question }: { question: string }) {
  return await handleAskProject({ text: question });
}
