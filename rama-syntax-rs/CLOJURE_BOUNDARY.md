# Typed Clojure/JVM boundary

Ordinary `.rama fn` forms are a typed language over Clojure/JVM values.
Dataflow typing is intentionally outside this slice.

## Surface

```rama
extern identity<T>(value: T) -> T
extern vec<T>(values: java.lang.Iterable<T>) -> java.util.List<T>

fn copy(values: java.util.List<String>) -> java.util.List<String> {
  return vec(values)
}

fn checked(value: Unknown) -> String {
  return value as String
}
```

Annotations use boxed JVM classes. Generic arguments are retained statically
even though JVM invocation erases them.

## Clojure polymorphism

Externs are compile-time method sets inspired by Julia:

- rank-1 quantified type variables;
- multiple signatures per name;
- tuple/arity applicability;
- nested type-variable substitution;
- specificity scoring;
- explicit ambiguity errors;
- unions retained in argument-dependent results.

Representative prelude models:

```text
vec<T>(Iterable<T>) -> List<T>
seq<T>(Iterable<T>) -> ISeq<T> | Nil
first<T>(Iterable<T>) -> T | Nil
get<K,V>(Map<K,V>, Any) -> V | Nil
conj<T,U>(List<T>, U) -> List<T | U>
assoc<K,V,K2,V2>(Map<K,V>, K2, V2) -> Map<K | K2, V | V2>
```

These signatures model Clojure behavior; they do not introduce new runtime
dispatch. The original Clojure Var still executes.

Future higher-order signatures need function/tuple/vararg types, capability
constraints such as `Seqable<T>` and `Reducible<T>`, and restricted type
functions (`Elem<C>`, `Invoke<F, Args>`, `LookupResult<...>`).

## Runtime contracts

Typed code is protected from untyped callers and foreign implementations:

1. typed `fn` arguments are checked on entry;
2. typed `fn` results are checked on exit;
3. explicit extern arguments are checked by a generated dispatcher;
4. extern results are checked before re-entering typed code;
5. `value as T` performs a checked narrowing;
6. generic List/Set/Map contracts recursively validate elements.

Failures throw `ExceptionInfo`:

```clojure
{:kind :contract-violation
 :path "echo argument `value`"
 :expected "java.lang.String"
 :actual "java.lang.Long"}
```

`Unknown` cannot be used as a concrete type without `as`. `Dynamic` is the
explicit unchecked escape hatch.

Type variables are erased in generated extern contracts. Their enclosing
collection/interface is checked, but a universally quantified element cannot
be reified without passing a type witness. Concrete typed function boundaries
still check their instantiated generic elements.

## Executed JVM/Clojure facts

Probes run against Clojure 1.12.4 / OpenJDK 21:

| Value     | Runtime class                     | Java interface   |
| --------- | --------------------------------- | ---------------- |
| `[]`      | `clojure.lang.PersistentVector`   | `java.util.List` |
| `{}`      | `clojure.lang.PersistentArrayMap` | `java.util.Map`  |
| `#{}`     | `clojure.lang.PersistentHashSet`  | `java.util.Set`  |
| `1`       | `java.lang.Long`                  | boxed Long       |
| `(int 1)` | `java.lang.Integer`               | boxed Integer    |

Runtime contracts use boxed classes, never primitive `Long/TYPE` etc.
`Class.cast` accepts nil, so it cannot enforce non-nullability. Clojure type
hints and pre/post assertions are not contracts: hints do not validate values,
and assertions can be disabled. Generated contracts use explicit
`Class.isInstance`/`instance?`, nil checks, recursive collection predicates,
and `ex-info`.

## Tests

```bash
cargo test
cargo test --test typed_contract_smoke -- --ignored
```

The runtime smoke test proves:

- valid typed calls succeed;
- wrong typed-function arguments fail with structured contract data;
- generic collection element mismatches fail;
- nullable results accept nil;
- explicit `as` succeeds/fails correctly;
- a deliberately dishonest extern return is caught.

## Current limits

- Connected checks use the live nREPL classloader for nominal assignability;
  Java method overload discovery is not yet surfaced as automatic externs.
- Offline checks retain a small bootstrap hierarchy when no nREPL is present.
- Higher-order function, tuple, and vararg types are not implemented yet.
- Flow/op expressions are not typed.
- Inferred function returns are not yet solved as a recursive SCC.
- User-defined bounds/capability traits are not yet surface syntax.
