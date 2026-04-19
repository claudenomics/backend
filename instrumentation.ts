export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.JOBS_WORKER_DISABLED === '1') return
  const { startWorker } = await import('@claudenomics/jobs')
  startWorker()
}
