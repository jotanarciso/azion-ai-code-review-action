import * as github from '@actions/github';
import { chat } from 'azion/ai';

const MAX_CHANGES = 1000;
const DEFAULT_PROMPT = `Analyze the following commit and provide:
1. A brief summary of changes
2. Code quality assessment
3. Potential issues or improvements
4. Security considerations if applicable`;

async function getCommitChanges(octokit, context, commitSha) {
  const response = await octokit.rest.repos.getCommit({
    owner: context.repo.owner,
    repo: context.repo.repo,
    ref: commitSha
  });
  
  return response.data;
}

async function buildCommitContext(commit, changes) {
  const files = changes.files.map(file => ({
    name: file.filename,
    changes: `Added: ${file.additions}, Removed: ${file.deletions}`,
    patch: file.patch
  }));

  return `
## Commit Analysis
SHA: ${commit.sha}
Author: ${commit.commit.author.name}
Message: ${commit.commit.message}

Changed Files:
${files.map(f => `- ${f.name} (${f.changes})`).join('\n')}

Code Changes:
\`\`\`diff
${files.map(f => f.patch).join('\n')}
\`\`\`
`;
}

async function analyzePR(octokit, context) {
  const commits = await octokit.rest.pulls.listCommits({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.payload.pull_request.number
  });

  let finalReview = '# Code Review Summary\n\n';
  
  for (const commit of commits.data) {
    const changes = await getCommitChanges(octokit, context, commit.sha);
    const totalChanges = changes.files.reduce((acc, file) => 
      acc + file.additions + file.deletions, 0);

    if (totalChanges > MAX_CHANGES) {
      const errorMessage = `### ⚠️ Large Changes Detected in Commit ${commit.sha.substring(0,7)}

This commit exceeds the recommended limit of ${MAX_CHANGES} lines.
Please consider breaking down the changes into smaller, incremental commits for better review.

**Recommendations:**
- Split changes into smaller, focused commits
- Make incremental changes
- Keep each commit with a single purpose`;

      await octokit.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.payload.pull_request.number,
        body: errorMessage
      });
      
      continue;
    }

    try {
      const commitContext = await buildCommitContext(commit, changes);
      const { data: response, error } = await chat(
        {
          messages: [
            { 
              role: 'user', 
              content: `${DEFAULT_PROMPT}\n\n${commitContext}` 
            }
          ]
        },
        { debug: true }
      );

      if (response) {
        finalReview += `\n## Review for commit ${commit.sha.substring(0,7)}
> ${commit.commit.message}

${response.choices[0].message.content}
---
`;
      } else {
        console.error('Error in AI response:', error);
        finalReview += `\n\n### ❌ Error analyzing commit ${commit.sha.substring(0,7)}`;
      }
    } catch (error) {
      console.error(`Error analyzing commit ${commit.sha}:`, error);
      finalReview += `\n\n### ❌ Error analyzing commit ${commit.sha.substring(0,7)}`;
    }
  }

  const logoUrl = 'https://avatars.githubusercontent.com/u/6660972?s=200&v=4';
  const logoSize = 14;
  const footer = `
<div align="right">
  <span style="vertical-align: middle; font-size: 12px; line-height: ${logoSize}px;">
    Powered by 
    <img src="${logoUrl}" alt="Azion Logo" width="${logoSize}" height="${logoSize}" style="vertical-align: middle; margin: 0 2px;">
    <a href="https://github.com/aziontech/lib/tree/main/packages/ai">Azion AI</a>
  </span>
</div>`;

  await octokit.rest.issues.createComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.payload.pull_request.number,
    body: finalReview + '\n\n---\n' + footer
  });
}

(async () => {
  try {
    const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
    await analyzePR(octokit, github.context);
  } catch (error) {
    console.error('Execution error:', error);
    process.exit(1);
  }
})();