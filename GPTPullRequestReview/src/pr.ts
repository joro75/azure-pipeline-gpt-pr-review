import * as tl from "azure-pipelines-task-lib/task.js";

const getDevOpsUrl = ({
  threadId,
  commentId,
}: { threadId?: string; commentId?: string } = {}): string => {
  const teamUrl = tl.getVariable("SYSTEM.TEAMFOUNDATIONCOLLECTIONURI");
  const projectId = tl.getVariable("SYSTEM.TEAMPROJECTID");
  const repoName = tl.getVariable("Build.Repository.ID");
  const prId = tl.getVariable("System.PullRequest.PullRequestId");

  if (!teamUrl || !projectId || !repoName || !prId) {
    throw new Error(
      "Missing required environment variables for URL construction.",
    );
  }

  let prUrl = `${teamUrl}${projectId}/_apis/git/repositories/${repoName}/pullRequests/${prId}/threads`;
  if (threadId) {
    prUrl += `/${threadId}/comments`;
    if (commentId) prUrl += `/${commentId}`;
  }

  tl.debug(`DevOps URL constructed: ${prUrl}`);
  return `${prUrl}?api-version=5.0`;
};

const fetchWithErrorHandling = async (
  url: string,
  options: RequestInit,
): Promise<Response> => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP error ${response.status}: ${errorText}`);
  }
  return response;
};

export async function addCommentToPR(
  fileName: string,
  comment: string,
): Promise<void> {
  const body = {
    comments: [
      {
        parentCommentId: 0,
        content: comment,
        commentType: 1,
      },
    ],
    status: 1,
    threadContext: {
      filePath: '/' + fileName,
    },
  };

  const prUrl = getDevOpsUrl();
  const accessToken = tl.getVariable("SYSTEM.ACCESSTOKEN") || "";

  await fetchWithErrorHandling(prUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  tl.debug(`New comment added to PR at file: ${fileName}`);
}

export async function deleteExistingComments(): Promise<void> {
  tl.debug("Starting deletion of existing comments added by the previous job.");

  const threadsUrl = getDevOpsUrl();
  const accessToken = tl.getVariable("SYSTEM.ACCESSTOKEN") || "";

  const threadsResponse = await fetchWithErrorHandling(threadsUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const threads = (await threadsResponse.json()) as { value: any[] };
  const threadsWithContext = threads.value.filter(
    (thread) => thread.threadContext !== null,
  );

  const collectionName = getCollectionName(
    tl.getVariable("SYSTEM.TEAMFOUNDATIONCOLLECTIONURI") || "",
  );
  const autoDeterminedBuildServiceName = `${tl.getVariable("SYSTEM.TEAMPROJECT")} Build Service (${collectionName})`;
  const buildServiceName = tl.getInput("buildservicename") || autoDeterminedBuildServiceName;
  tl.debug(`Checking for comments with displayName: ${buildServiceName}`);

  for (const thread of threadsWithContext) {
    const commentsUrl = getDevOpsUrl({ threadId: thread.id });

    const commentsResponse = await fetchWithErrorHandling(commentsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const comments = (await commentsResponse.json()) as { value: any[] };

    for (const comment of comments.value.filter(
      (comment) => comment.author.displayName === buildServiceName,
    )) {
      const removeCommentUrl = getDevOpsUrl({
        threadId: thread.id,
        commentId: comment.id,
      });

      await fetchWithErrorHandling(removeCommentUrl, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      tl.debug(`Deleted comment with ID: ${comment.id}`);
    }
  }

  tl.debug("Existing comments deleted.");
}

function getCollectionName(collectionUri: string): string {
  const collectionUriWithoutProtocol = collectionUri
    .replace("https://", "")
    .replace("http://", "");

  if (collectionUriWithoutProtocol.includes(".visualstudio.")) {
    return collectionUriWithoutProtocol.split(".visualstudio.")[0];
  } else {
    return collectionUriWithoutProtocol.split("/")[1];
  }
}
