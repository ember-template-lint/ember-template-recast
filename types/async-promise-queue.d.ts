declare module 'async-promise-queue' {
  type Worker = unknown;

  export default function (worker: Worker, work: unknown[], concurrency: number): Promise<unknown>;
}
