import { git } from "./git.js";
import { OpenAI } from "openai";
import { addCommentToPR } from "./pr.js";
import * as tl from "azure-pipelines-task-lib/task.js";

const defaultOpenAIModel = "gpt-3.5-turbo";
const defaultMaxTokens = 10000;
const defaultInstructions = `
Act as an experienced code reviewer for a team using .NET, Node.js, TypeScript, JavaScript, Java, and Python. The team follows SOLID principles and Domain-Driven Design (DDD) practices. You will be provided with Pull Request changes in a patch format. Each patch entry includes the commit message in the Subject line followed by the code changes (diffs) in a unidiff format.

Your tasks are:

- **Review Focus**:
  - Examine only the added, edited, or deleted lines in the diffs.
  - Do not comment on unchanged code or parts of the codebase not included in the diff.

- **Feedback Guidelines**:
  - Identify any bugs, potential issues, or deviations from best coding practices specific to the languages mentioned.
  - Check for adherence to **SOLID principles**:
    - **Single Responsibility Principle**: Ensure classes and modules have one responsibility.
    - **Open/Closed Principle**: Code should be open for extension but closed for modification.
    - **Liskov Substitution Principle**: Subtypes must be substitutable for their base types.
    - **Interface Segregation Principle**: Favor many specific interfaces over a single general-purpose interface.
    - **Dependency Inversion Principle**: Depend on abstractions, not on concretions.
  - Ensure the code aligns with **Domain-Driven Design (DDD)** practices:
    - Properly define domains, subdomains, and bounded contexts.
    - Use entities, value objects, aggregates, repositories, services, and domain events appropriately.
    - Maintain a clear separation between the domain model and application services.
  - Look for performance issues, security vulnerabilities, and code that doesn't adhere to language-specific conventions.
  - Provide clear, concise, and actionable feedback for any issues found.

- **Response Format**:
  - If the code changes are correct and there are no issues, respond with 'No feedback.'
  - Do not include any additional commentary outside of the feedback.

Please ensure your review is helpful and focused on improving code quality, correctness, and adherence to SOLID and DDD principles.
`;

export async function reviewFile(
  targetBranch: string,
  fileName: string,
  openai: OpenAI,
): Promise<void> {
  try {
    tl.debug(`Start reviewing ${fileName}...`);

    const patch = await git.diff([targetBranch, "--", fileName]);
    const model = tl.getInput("model") || defaultOpenAIModel;
    const instructions = tl.getInput("instructions") || defaultInstructions;
    const tokens = parseInt(tl.getInput("max_tokens") || "") || defaultMaxTokens;

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: patch },
      ],
      max_tokens: tokens,
    });

    const review = response.choices[0]?.message?.content?.trim() || "";

    if (review !== "No feedback.") {
      await addCommentToPR(fileName, review);
    }

    tl.debug(`Review of ${fileName} completed.`);
  } catch (error: any) {
    handleError(error, fileName);
  }
}

const handleError = (error: any, fileName: string): void => {
  if (error.response) {
    tl.error(`Error response for ${fileName}: ${error.response.status}`);
    tl.error(JSON.stringify(error.response.data));
  } else {
    tl.error(`Error for ${fileName}: ${error.message}`);
  }
};
