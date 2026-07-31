# Development instrumentation (design note)

A compiler flag should be able to instrument every typed binding so an AI or
human can inspect runtime values by stable source identity.

## Do not use runtime `def`

Injecting `(def >x x)` under a dataflow binding is unsafe:

- `def` mutates a process-global Var root;
- workers/tasks race and overwrite each other;
- a dataflow `*x` is not an ordinary lexical Clojure value at macro-expansion
  time;
- nREPL may be connected to a compiler or one worker rather than every task.

## Instrument Flow IR instead

Add a dev-only compiler pass after type checking:

```text
Bind(name, value, ...)
→ Bind(name, value, ...)
→ Probe(id, name, static_type, runtime_value, source_location)
```

The probe must preserve the continuation and value. Lowering can call a stable
runtime helper with the bound `*var`, then emit/pass it through unchanged.

Stable IDs should include:

```text
source-file : line : enclosing-form : lexical-path : variable-name
```

Example tape line (single-line EDN or JSON):

```text
{:probe "match.rama:74:ban-map/if[2]/expr[3]/turn"
 :task 2 :event "m1" :type "Long" :class "java.lang.Long" :value 3}
```

## Two development backends

1. `--trace-bindings`: emit sampled, redacted, one-line probe records to logs.
   This is greppable and works without nREPL.
2. `--probe-buffer`: keep a bounded per-worker ring buffer. A CLI with nREPL
   connectivity can query probe IDs and report recent values/classes.

For distributed deployments, the CLI must query every worker or use a
dedicated debug PState/stream. A local atom is only visible in one JVM. A debug
PState is globally queryable but perturbs topology/state, so it must remain a
development-only opt-in.

Instrumentation belongs on typed Flow IR, not Clojure text. That preserves
source spans, static types, lexical identity, and guarantees probes cannot
accidentally alter control-flow cardinality.
