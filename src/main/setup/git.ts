import { ipcMain } from 'electron'
import * as cp from 'child_process'
import { promisify } from 'util'
import log from 'electron-log'

const exec = promisify(cp.exec)

export default function setupGitIpcs() {
    // Initialize a new Git repository
    ipcMain.handle('git_init', async (event, { rootPath }) => {
        try {
            log.info(`Initializing git repository in ${rootPath}`)
            await exec('git init', { cwd: rootPath })
            return { success: true }
        } catch (error: any) {
            log.error('Git init error:', error)
            return { success: false, error: error.message }
        }
    })

    // Clone a repository
    ipcMain.handle('git_clone', async (event, { url, path: localPath }) => {
        try {
            log.info(`Cloning ${url} into ${localPath}`)
            await exec(`git clone "${url}" "${localPath}"`)
            return { success: true }
        } catch (error: any) {
            log.error('Git clone error:', error)
            return { success: false, error: error.message }
        }
    })

    // Get repository status
    ipcMain.handle('git_status', async (event, { rootPath }) => {
        try {
            const { stdout } = await exec('git status --porcelain', {
                cwd: rootPath,
            })
            return stdout
                .split('\n')
                .filter(Boolean)
                .map((line) => {
                    const status = line.substring(0, 2)
                    const file = line.substring(3)
                    return { status, file }
                })
        } catch (error) {
            return []
        }
    })

    // Get current branch name
    ipcMain.handle('git_current_branch', async (event, { rootPath }) => {
        try {
            const { stdout } = await exec('git rev-parse --abbrev-ref HEAD', {
                cwd: rootPath,
            })
            return { success: true, branch: stdout.trim() }
        } catch (error: any) {
            return { success: false, branch: null, error: error.message }
        }
    })

    // Get all branches
    ipcMain.handle('git_branches', async (event, { rootPath }) => {
        try {
            const { stdout } = await exec('git branch -a', { cwd: rootPath })
            const branches = stdout
                .split('\n')
                .filter(Boolean)
                .map((line) => ({
                    name: line.replace('*', '').trim(),
                    current: line.startsWith('*'),
                }))
            return { success: true, branches }
        } catch (error: any) {
            return { success: false, branches: [], error: error.message }
        }
    })

    // Create a new branch
    ipcMain.handle('git_create_branch', async (event, { rootPath, name }) => {
        try {
            await exec(`git checkout -b "${name}"`, { cwd: rootPath })
            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // Switch to a branch
    ipcMain.handle('git_checkout', async (event, { rootPath, branch }) => {
        try {
            await exec(`git checkout "${branch}"`, { cwd: rootPath })
            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // Delete a branch
    ipcMain.handle('git_delete_branch', async (event, { rootPath, branch }) => {
        try {
            await exec(`git branch -d "${branch}"`, { cwd: rootPath })
            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // Stage files
    ipcMain.handle('git_add', async (event, { rootPath, files }) => {
        try {
            const fileList = Array.isArray(files) ? files.join(' ') : files
            await exec(`git add ${fileList}`, { cwd: rootPath })
            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // Unstage files
    ipcMain.handle('git_unstage', async (event, { rootPath, files }) => {
        try {
            const fileList = Array.isArray(files) ? files.join(' ') : files
            await exec(`git reset -- ${fileList}`, { cwd: rootPath })
            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // Commit changes
    ipcMain.handle('git_commit', async (event, { rootPath, message }) => {
        try {
            await exec(`git commit -m "${message}"`, { cwd: rootPath })
            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // Push to remote
    ipcMain.handle('git_push', async (event, { rootPath, remote, branch }) => {
        try {
            const remoteName = remote || 'origin'
            const branchName = branch || 'HEAD'
            log.info(`Pushing to ${remoteName} ${branchName}`)
            const { stdout, stderr } = await exec(
                `git push ${remoteName} ${branchName}`,
                { cwd: rootPath }
            )
            return { success: true, output: stdout || stderr }
        } catch (error: any) {
            log.error('Git push error:', error)
            return { success: false, error: error.message }
        }
    })

    // Pull from remote
    ipcMain.handle('git_pull', async (event, { rootPath, remote, branch }) => {
        try {
            const remoteName = remote || 'origin'
            const branchName = branch || ''
            log.info(`Pulling from ${remoteName} ${branchName}`)
            const { stdout, stderr } = await exec(
                `git pull ${remoteName} ${branchName}`,
                { cwd: rootPath }
            )
            return { success: true, output: stdout || stderr }
        } catch (error: any) {
            log.error('Git pull error:', error)
            return { success: false, error: error.message }
        }
    })

    // Fetch from remote
    ipcMain.handle('git_fetch', async (event, { rootPath }) => {
        try {
            await exec('git fetch --all', { cwd: rootPath })
            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // Get remotes
    ipcMain.handle('git_remotes', async (event, { rootPath }) => {
        try {
            const { stdout } = await exec('git remote -v', { cwd: rootPath })
            const remotes = stdout
                .split('\n')
                .filter(Boolean)
                .map((line) => {
                    const [name, url, type] = line.split(/\s+/)
                    return { name, url, type: type?.replace(/[()]/g, '') }
                })
            return { success: true, remotes }
        } catch (error: any) {
            return { success: false, remotes: [], error: error.message }
        }
    })

    // Add remote
    ipcMain.handle('git_add_remote', async (event, { rootPath, name, url }) => {
        try {
            await exec(`git remote add "${name}" "${url}"`, { cwd: rootPath })
            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // Remove remote
    ipcMain.handle('git_remove_remote', async (event, { rootPath, name }) => {
        try {
            await exec(`git remote remove "${name}"`, { cwd: rootPath })
            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // Get commit log
    ipcMain.handle('git_log', async (event, { rootPath, limit }) => {
        try {
            const maxCount = limit || 10
            const { stdout } = await exec(`git log --oneline -n ${maxCount}`, {
                cwd: rootPath,
            })
            return stdout
                .split('\n')
                .filter(Boolean)
                .map((line) => {
                    const [hash, ...msg] = line.split(' ')
                    return { hash, message: msg.join(' ') }
                })
        } catch (error) {
            return []
        }
    })

    // Check if directory is a git repository
    ipcMain.handle('git_is_repo', async (event, { rootPath }) => {
        try {
            await exec('git rev-parse --git-dir', { cwd: rootPath })
            return { success: true, isRepo: true }
        } catch (error) {
            return { success: true, isRepo: false }
        }
    })

    // Get git config
    ipcMain.handle('git_config_get', async (event, { rootPath, key }) => {
        try {
            const { stdout } = await exec(`git config --get ${key}`, {
                cwd: rootPath,
            })
            return { success: true, value: stdout.trim() }
        } catch (error: any) {
            return { success: false, value: null, error: error.message }
        }
    })

    // Set git config
    ipcMain.handle(
        'git_config_set',
        async (event, { rootPath, key, value }) => {
            try {
                await exec(`git config ${key} "${value}"`, { cwd: rootPath })
                return { success: true }
            } catch (error: any) {
                return { success: false, error: error.message }
            }
        }
    )

    // Get diff
    ipcMain.handle('git_diff', async (event, { rootPath, file, mode }) => {
        try {
            const diffMode =
                mode === 'staged'
                    ? '--cached'
                    : mode === 'head'
                    ? 'HEAD'
                    : ''
            const fileArg = file ? `-- "${file}"` : ''
            const { stdout } = await exec(`git diff ${diffMode} ${fileArg}`, {
                cwd: rootPath,
            })
            return { success: true, diff: stdout }
        } catch (error: any) {
            return { success: false, diff: '', error: error.message }
        }
    })

    // Stash changes
    ipcMain.handle('git_stash', async (event, { rootPath, message }) => {
        try {
            const msg = message ? `save "${message}"` : ''
            await exec(`git stash ${msg}`, { cwd: rootPath })
            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // Apply stash
    ipcMain.handle('git_stash_pop', async (event, { rootPath }) => {
        try {
            await exec('git stash pop', { cwd: rootPath })
            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })
}
