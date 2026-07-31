# Rama rules and compiler invariants

The compiler deliberately has two validation layers:

1. **Rama rules** inspect semantic `.rama` IR and report source-spanned user
   diagnostics.
2. **Clojure IR invariants** inspect generated target forms. A violation is a
   compiler bug, not something the `.rama` author should repair.

## Rama IR rules

| Rule                             | Why                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `rama/known-pstate`              | An undeclared `$$` name cannot resolve in the module.                                                              |
| `rama/navigator-outside-keypath` | A navigator inside `keypath` is treated as a key; `AFTER-ELEM` there can kill a worker with `Key must be integer`. |
| `rama/transform-has-write-term`  | `nil->val` is a view; writes must end in `term`, `termval`, `multi-path`, or `NONE>`.                              |
| `rama/fn-no-dataflow`            | Plain `fn` lowers to Clojure and cannot select/transform PStates, `fail`, or `\|hash`.                             |
| `rama/shallow-op-if`             | Deep `<<if` trees can overflow `clojure.algo.monads`; use `fn` predicates or `fail` guards.                        |

## Clojure IR invariants

| Invariant                            | Rama failure that motivated it                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `clj/else-marker-is-form`            | Rama expects `(else>)`, not bare `else>`.                                                                                         |
| `clj/no-clojure-control-in-dataflow` | `cond`, `if`, `and`, and `or` expand to forms Rama dataflow cannot resolve. The compiler lifts these to top-level helper `defn`s. |
| `clj/hash-by-symbol`                 | Depot `hash-by` uses a stable top-level function, not an inline function.                                                         |
| `clj/deframaop-pstate-parameter`     | A top-level `deframaop` must receive each `$$` logvar it uses or compilation fails with `Attach point missing needed logvar`.     |
| `clj/rest-fixed-key-strings`         | REST JSON paths use strings; keyword fixed keys cause runtime `Invalid key`.                                                      |

## Policy, not rules

- Surface field syntax uses `:field` for readability, but this REST-first
  compiler lowers state/event field keys to Clojure strings.
- `and`/`or` in source are not errors. In `op`, lowering emits `and>`/`or>`;
  in `fn`, lowering keeps ordinary Clojure `and`/`or`.
- `return` is context-sensitive lowering: a value in `fn`, `ack-return>` in
  `op`.

When Rama exposes a new nit, first classify it:

- user-authored semantic mistake → Rama IR rule;
- compiler-selected invalid target shape → Clojure IR invariant;
- behavior the compiler can safely normalize → lowering implementation plus
  target-invariant regression test.
