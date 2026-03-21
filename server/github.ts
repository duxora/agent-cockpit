import { Octokit } from 'octokit'
import { getGitHubConfig } from './db.js'

let octokit: Octokit | null = null

export function initGitHub(): void {
  const config = getGitHubConfig()
  if (config && config.token) {
    octokit = new Octokit({
      auth: config.token
    })
  }
}

export interface GitHubPR {
  number: number
  title: string
  author: string
  state: string
  url: string
  createdAt: string
}

export interface GitHubIssue {
  number: number
  title: string
  state: string
  labels: string[]
  url: string
}

export interface GitHubBranch {
  name: string
  commit: string
  url: string
}

export async function fetchPRs(owner: string, repo: string): Promise<GitHubPR[]> {
  if (!octokit) throw new Error('GitHub not configured')

  try {
    const response = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      per_page: 10
    })

    return response.data.map(pr => ({
      number: pr.number,
      title: pr.title,
      author: pr.user?.login || 'unknown',
      state: pr.state,
      url: pr.html_url,
      createdAt: pr.created_at
    }))
  } catch (error) {
    console.error('Failed to fetch PRs:', error)
    return []
  }
}

export async function fetchIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
  if (!octokit) throw new Error('GitHub not configured')

  try {
    const response = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: 'open',
      per_page: 10
    })

    return response.data.map(issue => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      labels: issue.labels.map(l => typeof l === 'string' ? l : l.name || ''),
      url: issue.html_url
    }))
  } catch (error) {
    console.error('Failed to fetch issues:', error)
    return []
  }
}

export async function fetchBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
  if (!octokit) throw new Error('GitHub not configured')

  try {
    const response = await octokit.rest.repos.listBranches({
      owner,
      repo,
      per_page: 10
    })

    return response.data.map(branch => ({
      name: branch.name,
      commit: branch.commit.sha.substring(0, 7),
      url: `https://github.com/${owner}/${repo}/tree/${branch.name}`
    }))
  } catch (error) {
    console.error('Failed to fetch branches:', error)
    return []
  }
}
