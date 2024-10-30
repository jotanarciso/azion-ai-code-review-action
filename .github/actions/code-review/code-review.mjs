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

async function getPRContext(octokit, context) {
  const pr = await octokit.rest.pulls.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.payload.pull_request.number
  });

  return `
## Pull Request Information
Title: ${pr.data.title}
Description: ${pr.data.body || 'No description provided'}
Author: ${pr.data.user.login}
Base Branch: ${pr.data.base.ref}
Head Branch: ${pr.data.head.ref}
Number of Files Changed: ${pr.data.changed_files}
Total Additions: ${pr.data.additions}
Total Deletions: ${pr.data.deletions}
`;
}

async function analyzePR(octokit, context) {
  const commits = await octokit.rest.pulls.listCommits({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: context.payload.pull_request.number
  });

  let finalReview = '# Code Review Summary\n\n';
  let commitReviews = [];
  let largeCommits = [];
  
  // Analisa cada commit
  for (const commit of commits.data) {
    const changes = await getCommitChanges(octokit, context, commit.sha);
    const totalChanges = changes.files.reduce((acc, file) => 
      acc + file.additions + file.deletions, 0);

    if (totalChanges > MAX_CHANGES) {
      largeCommits.push({
        sha: commit.sha,
        message: commit.commit.message,
        changes: totalChanges
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
        commitReviews.push({
          sha: commit.sha,
          message: commit.commit.message,
          review: response.choices[0].message.content
        });
      }
    } catch (error) {
      console.error(`Error analyzing commit ${commit.sha}:`, error);
    }
  }

  // Adiciona seção de commits muito grandes
  if (largeCommits.length > 0) {
    finalReview += '## ⚠️ Large Commits Detected\n\n';
    for (const commit of largeCommits) {
      finalReview += `### ❌ Commit ${commit.sha.substring(0,7)}
> ${commit.message}

This commit exceeds the recommended limit of ${MAX_CHANGES} lines (found ${commit.changes} changes).
Please consider breaking down the changes into smaller, incremental commits for better review.

**Recommendations:**
- Split changes into smaller, focused commits
- Make incremental changes
- Keep each commit with a single purpose

---\n\n`;
    }
  }

  // Adiciona reviews dos commits válidos
  finalReview += '## Commit Reviews\n\n';
  for (const review of commitReviews) {
    finalReview += `### ✅ Commit ${review.sha.substring(0,7)}
> ${review.message}

${review.review}
---\n\n`;
  }

  // Gera resumo final do PR
  const prContext = await getPRContext(octokit, context);
  const { data: finalSummary } = await chat(
    {
      messages: [
        {
          role: 'user',
          content: `Based on the following PR information and commit reviews, provide a concise summary of all changes:

${prContext}

Commits Analysis:
${commitReviews.map(r => `- ${r.sha.substring(0,7)}: ${r.message}`).join('\n')}

${largeCommits.length > 0 ? `\nNote: ${largeCommits.length} commits were too large to analyze.` : ''}

Please provide:
1. Overall impact of changes
2. Key modifications
3. Potential concerns
4. Final recommendations`
        }
      ]
    },
    { debug: true }
  );

  if (finalSummary) {
    finalReview += `## Overall Summary\n\n${finalSummary.choices[0].message.content}\n\n`;
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