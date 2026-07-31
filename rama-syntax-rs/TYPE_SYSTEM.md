# Type system: JVM values and Rama schemas

`.rama` is gradually typed, strict by default. Its design has two orthogonal
algebras:

1. **value types** describe ordinary values and follow the JVM type system;
2. **schemas** describe how Rama stores, indexes, and navigates PState data.

Runtime representation is a lowering contract, not a third type system.
CljExpr IR and Flow IR share the same type/schema tables.

## JVM value types

Every ordinary expression has a JVM-oriented value type:

```text
Jvm(class, type-arguments)
Function(parameters, return)
Union(types)
Nil
Unknown
Dynamic
```

Source aliases resolve to real boxed JVM classes:

| `.rama` alias | JVM class           |
| ------------- | ------------------- |
| `String`      | `java.lang.String`  |
| `Long`        | `java.lang.Long`    |
| `Int`         | `java.lang.Integer` |
| `Boolean`     | `java.lang.Boolean` |
| `Object`      | `java.lang.Object`  |

Fully qualified JVM types are ordinary annotations:

```rama
fn size(xs: java.util.List<String>) -> Long
fn contains(xs: java.util.Set<String>, value: String) -> Boolean
```

These are real nominal classes/interfaces. The compiler resolves them against
the classpath, validates arity/bounds, and uses JVM assignability and overload
resolution. Generic arguments are retained by `.rama` analysis even though
JVM method descriptors erase them.

An in-memory collection is not promoted into a special `.rama` collection
type. A Clojure vector, Java `ArrayList`, or other collection has the
appropriate nominal JVM type (possibly widened to a declared interface).

`Unknown` may contain any value but must be narrowed/asserted before use.
`Dynamic` is the explicit unsound escape hatch analogous to TypeScript `any`.

## Rama storage schemas

Schemas are not JVM value types. They describe distributed storage, indexing,
and path behavior:

```text
Leaf(value-type)
PMap(key-type, value-schema)
PSet(element-type)
PVector(element-schema)
PStruct(fields)
```

Example surface:

```rama
schema Match = PStruct {
  :homeTeamId String
  :awayTeamId String
  :status     String
  :score      Long
}

pstate $$matches: PMap<String, Match>
pstate $$tags:    PMap<String, PSet<String>>
pstate $$events:  PMap<String, PVector<Event>>
```

`PMap`, `PSet`, `PVector`, and `PStruct` exist only in schema position:

- `PMap` lowers to `map-schema`;
- `PSet` lowers to `set-schema`;
- `PVector` lowers to `vector-schema`;
- `PStruct` lowers to `fixed-keys-schema`;
- leaf value types lower to their JVM class symbols.

Rama's restrictions belong to schema construction. For example, current Rama
requires `PSet` elements to be leaf value types rather than nested schemas,
and only certain schemas are valid at the PState root.

## Path typing

The path checker folds a schema focus through navigator transfer functions:

```text
PathFocus {
  schema: Schema,
  cardinality: One | ZeroOrOne | Many | Unknown,
  mode: Select | Transform,
}
```

Examples:

```text
PMap<K,V>       + keypath(k: K)     -> focus V
PStruct{f: S}   + keypath(:f)      -> focus S
PVector<S>      + ALL              -> focus S, Many
PSet<T>         + ALL              -> focus Leaf(T), Many
subselect(path)                    -> JVM collection value, One
```

When navigation reaches `Leaf(T)`, a select binding receives ordinary JVM type
`T`. A focus that still denotes indexed storage remains a schema focus; it
does not pretend to be `java.util.Map` or `java.util.Set`.

The precise materialized JVM type returned by `subselect` and other collecting
navigators is established by executable Rama probes, not guessed.

## Value-to-storage boundary

`termval` and related writes cross from JVM values into a schema:

```text
java.util.Map<String, Object>
  -- checked against PStruct Match -->
PStruct storage
```

The compiler checks:

- key and leaf assignability;
- required/unknown fixed fields;
- collection element types;
- nullability;
- Rama schema restrictions;
- whether the runtime collection representation is path-compatible.

Rama can serialize mutable Java collections, but built-in paths operate on
immutable Clojure data structures. The compiler may insert a safe conversion
at the storage boundary or require an explicit conversion. This is a lowering
policy, not another type hierarchy.

## Typed backend split

After typed Rama IR:

```text
Type table + Schema table
          ↓
    Typed Rama IR
      ├── CljExpr IR
      └── Flow IR
```

CljExpr IR contains ordinary evaluation: JVM/Clojure calls, `let`, `if`,
`cond`, and helper functions.

Flow IR contains dataflow semantics: bindings, emissions, PState operations,
paths, partitions, branches, and acknowledgements.

Both IRs reference the same `TypeId` and `SchemaId`. Flow IR cannot represent
embedded Clojure control macros; complex expressions are lifted into typed
CljExpr helpers with explicit captures.

## Untyped Clojure seam

Untyped values enter only through explicit boundaries:

1. typed `extern` declarations for known Clojure Vars and JVM methods;
2. classpath reflection for Java constructors/methods;
3. `clojure { ... }`, which returns `Unknown` unless annotated;
4. explicit assertion/cast from `Unknown` or `Dynamic`;
5. REST/depot input, validated against a declared event type at runtime.

Clojure Vars without signatures produce `Unknown` in gradual mode and errors
in strict mode. JVM type hints aid interop and reflection performance, but are
not runtime contracts.

## Separation of concerns

- `Type` answers: **what ordinary value is this?**
- `Schema` answers: **how is this PState data stored and navigated?**
- IR kind answers: **ordinary evaluation or dataflow?**
- cardinality answers: **how many continuations can this emit?**

Keeping these axes separate creates more small concepts but avoids tying them
into one representation-dependent knot.
