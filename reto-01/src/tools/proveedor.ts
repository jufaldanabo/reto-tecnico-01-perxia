// TODO (slice 01+): cada export aquí se expone al modelo como proveedor_<export>
//   según PRD §6.2. Shape obligatorio:
//     { description: string, args: ZodRawShape, execute(args, ctx): Promise<string> }
//   execute devuelve string JSON con { ok: true, data } | { ok: false, error }. Nunca lanza.
export {}
