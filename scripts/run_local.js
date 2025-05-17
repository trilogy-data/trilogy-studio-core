// scripts/run-with-python.js
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import process from 'process'

const __filename = fileURLToPath(import.meta.url)

// Log startup message
console.log('Starting Python server and dev server...')

// Start the Python server process
const pythonProcess = spawn('python', ['pyserver/main.py'], {
  stdio: 'inherit',
  shell: true,
})

// Start the npm dev process
const npmProcess = spawn('npm', ['run', 'dev'], {
  stdio: ['pipe', 'inherit', 'inherit'],
  shell: true,
})

// Handle process termination
function cleanup() {
  console.log('\nTerminating processes...')

  // Kill the Python process
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill('SIGINT')
  }

  // Kill the npm process
  if (npmProcess && !npmProcess.killed) {
    npmProcess.kill('SIGINT')
    console.log('Attempting to confirm process termination...')
    npmProcess.stdin.write('y\n')
    console.log('Automatically confirmed process termination')
  }

  process.exit(0)
}

// Listen for termination signals
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

// Handle errors in child processes
pythonProcess.on('error', (err) => {
  console.error(`Failed to start Python server: ${err}`)
  cleanup()
})

npmProcess.on('error', (err) => {
  console.error(`Failed to start dev server: ${err}`)
  cleanup()
})

// Handle exit of child processes
pythonProcess.on('exit', (code) => {
  console.log(`Python server exited with code ${code}`)
  if (code !== 0 && code !== null) {
    cleanup()
  }
})

npmProcess.on('exit', (code) => {
  console.log(`Dev server exited with code ${code}`)
  if (code !== 0 && code !== null) {
    cleanup()
  }
})

console.log('Both processes started. Press Ctrl+C to terminate both.')
