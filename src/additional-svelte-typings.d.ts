/// <reference types="mochi-framework/ambient" />

// mochi-framework ships raw .ts source, so our tsc compiles its internals —
// including src/email/transports.ts, which imports `nodemailer`. nodemailer has
// no bundled types and @types/nodemailer lags a major version behind, so declare
// it as an untyped module. We don't use mochi's email transports.
declare module 'nodemailer';
