import * as github from '@actions/github';
import { streamChat } from 'azion/ai';

const DEFAULT_PROMPT = `Analyze the following pull request and provide a summary of what it implements, including good practices, possible problems, and suggestions for improvement.
Provide your analysis in Markdown format, starting with a general summary of the pull request.`;

const MAX_FILES = 10;

async function* analyzeFileStream(file, octokit, context, pullRequest) {
  try {
    const { data: content } = await octokit.rest.repos.getContent({
      owner: context.repo.owner,
      repo: context.repo.repo,
      path: file.filename,
      ref: pullRequest.head.sha,
    });

    const fileContent = Buffer.from(content.content, 'base64').toString('utf-8');
    
    const filePrompt = `Analyze this file and provide a brief summary of its contents and any potential issues:
File: ${file.filename}

${fileContent}`;

    let analysisText = '';
    const stream = streamChat({
      messages: [{ role: 'user', content: filePrompt }]
    });

    for await (const { data, error } of stream) {
      if (error) {
        throw error;
      }
      if (data?.choices[0]?.delta?.content) {
        analysisText += data.choices[0].delta.content;
        // Yield progress para feedback em tempo real
        yield {
          type: 'progress',
          filename: file.filename,
          content: data.choices[0].delta.content
        };
      }
    }

    return {
      type: 'complete',
      filename: file.filename,
      analysis: analysisText
    };
  } catch (error) {
    console.error(`Error analyzing file ${file.filename}:`, error.message);
    return {
      type: 'error',
      filename: file.filename,
      error: error.message
    };
  }
}

async function runCodeReview() {
  const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
  const context = github.context;

  try {
    console.log('Starting code review...');

    const { data: pullRequest } = await octokit.rest.pulls.get({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.payload.pull_request.number,
    });

    const { data: files } = await octokit.rest.pulls.listFiles({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.payload.pull_request.number,
    });

    if (files.length > MAX_FILES) {
      console.warn(`Pull request contains ${files.length} files, analyzing only the first ${MAX_FILES}.`);
    }

    const fileAnalyses = [];
    const analyzableFiles = files
      .slice(0, MAX_FILES)
      .filter(file => file.status !== 'removed');

    // Processa arquivos sequencialmente para evitar sobrecarga
    for (const file of analyzableFiles) {
      console.log(`Analyzing file: ${file.filename}`);
      for await (const result of analyzeFileStream(file, octokit, context, pullRequest)) {
        if (result.type === 'progress') {
          process.stdout.write('.');  // Feedback visual do progresso
        } else if (result.type === 'complete') {
          fileAnalyses.push(result);
          console.log(`\nCompleted analysis of ${result.filename}`);
        }
      }
    }

    // Gera resumo final usando streaming
    console.log('\nGenerating final summary...');
    const summaryPrompt = `Provide a summary of the following file analyses:

${fileAnalyses.map(analysis => `## ${analysis.filename}\n${analysis.analysis}`).join('\n\n')}

Provide a concise overall summary of the changes.`;

    let finalSummary = '';
    const summaryStream = streamChat({
      messages: [{ role: 'user', content: summaryPrompt }]
    });

    for await (const { data, error } of summaryStream) {
      if (error) throw error;
      if (data?.choices[0]?.delta?.content) {
        finalSummary += data.choices[0].delta.content;
        process.stdout.write('.');
      }
    }

    const logoUrl = 'https://avatars.githubusercontent.com/u/6660972?s=200&v=4';
    const logoSize = 14;
    const footer = `
<div align="right">
  <span style="vertical-align: middle; font-size: 12px; line-height: ${logoSize}px;">
    Powered by 
    <img src="${logoUrl}" alt="Azion Logo" width="${logoSize}" height="${logoSize}" style="vertical-align: middle; margin: 0 2px;">
    <a href="https://github.com/aziontech/lib/tree/main/packages/ai" style="vertical-align: middle; text-decoration: none;">Azion AI</a>
  </span>
</div>`;

    const commentBody = finalSummary + '\n\n---\n' + footer;

    await octokit.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.payload.pull_request.number,
      body: commentBody,
    });

    console.log('\nCode review completed successfully');
  } catch (error) {
    console.error('Error during code review:', error);
    throw error;
  }
}

(async () => {
  try {
    await runCodeReview();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();