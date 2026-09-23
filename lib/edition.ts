/**
 * Which edition of the platform this server is: the clean one that ships
 * empty, or the demo, which runs on its own filled database (see
 * scripts/demo.ts). Read at request time, so one build serves either.
 */
export const isDemo = () => process.env.SANOVIO_EDITION === "demo";
