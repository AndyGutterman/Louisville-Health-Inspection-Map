/**
 * tests/support/fakeSupa.js — a Supabase client stand-in. Records every call chain
 * (`from(table)` and each method after it, with its arguments); awaiting a chain
 * resolves to { data: answer(call) ?? [], error: null }. `rpc(name, args)` is recorded as
 * { table: "rpc/<name>", ops: [["rpc", args]] } and answers the same way.
 */
export function fakeSupa(answer = () => []) {
  const calls = [];
  const from = (table) => {
    const call = { table, ops: [] };
    calls.push(call);
    const chain = new Proxy(
      {},
      {
        get(_, op) {
          if (op === "then") {
            return (resolve) => resolve({ data: answer(call) ?? [], error: null });
          }
          return (...a) => {
            call.ops.push([op, ...a]);
            return chain;
          };
        },
      },
    );
    return chain;
  };
  // The first method called on a chain (select, insert, update, upsert), and its argument.
  const op = (call) => call.ops[0]?.[0];
  const rpc = async (name, args) => {
    const call = { table: `rpc/${name}`, ops: [["rpc", args]] };
    calls.push(call);
    return { data: answer(call) ?? [], error: null };
  };
  return { supa: { from, rpc }, calls, op };
}
