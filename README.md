# Azion AI Code Review Action

Performs an AI-powered code review on pull requests using Azion's AI technology. The action analyzes the changes and provides insights, suggestions, and potential improvements.

## Features
- Automated code review using AI
- Customizable review prompts
- Supports multiple files analysis
- Provides detailed feedback in markdown format

## Inputs

* __github-token__: GitHub token for repository access (required)
* __azion-token__: Azion token for AI service authentication (required)
* __prompt__: Custom prompt for the AI code review (optional)
  * Default: Analyzes the PR and provides implementation summary, good practices, problems, and improvement suggestions
* __max-files__: Maximum number of files to review (optional)
  * Default: 1000

## Usage Example
```yaml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize]
    branches:
      - main
      - develop

permissions:
  contents: read
  pull-requests: write
  checks: write

jobs:
  code-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run AI Code Review
        uses: aziontech/azion-github-actions/actions/azion-ai-code-review@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          azion-token: ${{ secrets.AZION_TOKEN }}
          prompt: |
            Please review this code focusing on:
            - Security best practices
            - Performance optimizations
            - Code maintainability
            - Potential bugs
          max-files: 50
```

## Custom Prompt Examples

### Security Focus
```yaml
prompt: |
  Analyze this code with a focus on security:
  - Check for potential vulnerabilities
  - Identify security best practices
  - Suggest security improvements
  - Review error handling
```

### Performance Focus
```yaml
prompt: |
  Review this code for performance:
  - Identify performance bottlenecks
  - Suggest optimization opportunities
  - Check resource usage
  - Review algorithmic efficiency
```

## Notes
- The action requires both `GITHUB_TOKEN` and `AZION_TOKEN` secrets configured in your repository
- Reviews are posted as pull request comments
- Large files or PRs might be skipped to maintain performance
- The action follows GitHub's rate limits and best practices
