import { getOctokit } from '@actions/github';
import { Azion } from 'azion';

const MAX_CHANGES = 1000;

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
## Commit Context
- SHA: ${commit.sha}
- Author: ${commit.commit.author.name}
- Message: ${commit.commit.message}

### Changed Files:
${files.map(f => `- ${f.name} (${f.changes})`).join('\n')}

### Code Changes:
\`\`\`diff
${files.map(f => f.patch).join('\n')}
\`\`\`
`;
}

async function analyzePR(octokit, context) {
  const commits = await octokit.rest.pulls.listCommits({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.issue.number
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
        issue_number: context.issue.number,
        body: errorMessage
      });
      
      continue;
    }

    try {
      const commitContext = await buildCommitContext(commit, changes);
      const azion = new Azion(process.env.AZION_API_TOKEN);
      const response = await azion.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are a code review expert. Analyze the following commit and provide:
1. A brief summary of changes
2. Code quality assessment
3. Potential issues or improvements
4. Security considerations if applicable`
          },
          {
            role: 'user',
            content: commitContext
          }
        ]
      });

      finalReview += `\n## Review for commit ${commit.sha.substring(0,7)}
> ${commit.commit.message}

${response.choices[0].message.content}
---
`;
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
    issue_number: context.issue.number,
    body: finalReview + '\n\n---\n' + footer
  });
}

try {
  const token = process.env.GITHUB_TOKEN;
  const octokit = getOctokit(token);
  
  await analyzePR(octokit, context);
} catch (error) {
  console.error('Execution error:', error);
  process.exit(1);
}