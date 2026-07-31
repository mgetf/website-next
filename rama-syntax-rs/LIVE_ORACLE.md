# Live nREPL type oracle

`rama-check` can use the same live Clojure runtime for JVM reflection, Var
discovery, concrete call observation, and future value probes. There is no
separate reflection helper protocol: nREPL is the integration seam.

## Start a runtime

For this repository:

```bash
cd rama
lein repl :headless :port 7888
```

## Live checking and suggestions

```bash
cargo run -- check fixtures/typed_fn.rama --nrepl 127.0.0.1:7888
```

When typed code calls an unknown Var, the checker resolves its live metadata
and includes source-ready gradual declarations:

```text
unknown function `frequencies`; add an extern declaration
observed live Var; pin one of:
  extern frequencies = clojure.core/frequencies(coll: Unknown) -> Unknown
```

The diagnostic remains an error. Runtime discovery does not silently mutate
the program's type environment.

Connected JVM assignability queries call `Class.isAssignableFrom` in the live
classloader and are cached for the session. The small offline hierarchy is
only a bootstrap fallback when no runtime can answer.

## Observe and pin a concrete call

```bash
cargo run -- observe-call \
  fixtures/my_module.rama \
  clojure.core/vec \
  --args '[[1 2 3]]' \
  --nrepl 127.0.0.1:7888
```

Output:

```rama
extern vec = clojure.core/vec(arg0: java.util.List<Long>)
  -> java.util.List<Long>
```

Use `--write` to append the observation to the `.rama` source:

```rama
// observed from `clojure.core/vec` through nREPL; concrete sample, safe to generalize
extern vec = clojure.core/vec(arg0: java.util.List<Long>)
  -> java.util.List<Long>
```

The generated declaration is deliberately concrete. The developer or AI can
generalize repeated observations into a quantified signature such as:

```rama
extern vec<T>(values: java.lang.Iterable<T>) -> java.util.List<T>
```

Observed heterogeneous collections preserve finite unions:

```rama
extern vec = clojure.core/vec(arg0: java.util.List<Long | String>)
  -> java.util.List<Long | String>
```

## Trust model for an AI workflow

- The runtime discovers facts and supplies evidence.
- Source declarations store facts for CI and future agent sessions.
- Runtime contracts enforce pinned claims at typed/untyped crossings.
- Live classpath facts drive the current check and are cached only in memory.
- Future trace probes use stable source IDs and the same nREPL connection.

This is intentionally practical rather than closed-world: dynamic Clojure
remains dynamic, but observations become explicit, reviewable program facts
instead of invisible compiler state.

## Current protocol

`src/nrepl.rs` implements nREPL's bencoded streaming protocol directly:

- request IDs and multi-message responses;
- `eval` output/error/status handling;
- socket timeouts;
- mock TCP protocol tests;
- live ignored conformance tests.

The next extensions are stable-ID Flow-IR probes, observation aggregation
across calls/workers, and suggested generalization from repeated samples.
