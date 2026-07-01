const jobs = new Map();

export function createJob(jobId) {
    const job = {
        id: jobId,
        status: "running",
        progress: 0,
        filePath: null,
        error: null,
    };
    jobs.set(jobId, job);
    return job;
}

export function getJob(jobId) {
    return jobs.get(jobId);
}

export function removeJob(jobId) {
    jobs.delete(jobId);
}
