# Type-system and JVM seam

`.rama` is gradually typed, but strict by default. The compiler tracks richer
types than the JVM can represent after erasure.

## Three related type domains

### 1. Semantic `.rama` types

These are used for inference, path checking, and diagnostics:

```text
String, Long, Int, Boolean, Nil
T?
Struct{name: T, ...}
Map<K, V>
Vector<T>
Set<T>
PState<Schema>
Fn<(A, B) -> R>
Flow<(A, B) -> Emit<R, Cardinality>>
Dynamic
Unknown
Jvm<Class, Args...>
```

`Struct`, `Map`, `Vector`, and `Set` are structural schema types. They retain
their element/field types even though their runtime values are JVM objects.

`Dynamic` is the explicit unsound escape hatch (TypeScript `any`). `Unknown`
can hold any runtime value but must be narrowed or asserted before use. A
PState schema leaf declared as Rama `Object` lowers to `java.lang.Object`, but
reading it should produce `Unknown`, not grant arbitrary operations.

### 2. JVM nominal types

Primitive aliases resolve to real boxed JVM classes used by Rama schemas:

| `.rama`   | JVM/Rama leaf       |
| --------- | ------------------- |
| `String`  | `java.lang.String`  |
| `Long`    | `java.lang.Long`    |
| `Int`     | `java.lang.Integer` |
| `Boolean` | `java.lang.Boolean` |
| `Object`  | `java.lang.Object`  |

Fully qualified annotations can name nominal JVM types:

```rama
fn size(xs: Jvm<java.util.List<String>>) -> Long
```

Generic arguments are checked by `.rama`; the JVM descriptor still erases
them. Classpath metadata/reflection validates classes, methods, overloads, and
generic signatures when available.

Clojure Vars have no dependable JVM method signature. Calls to them require a
typed `extern` declaration/prelude; undeclared Vars return `Unknown` in gradual
mode and are errors in strict mode.

### 3. Runtime representation and PState schema

Structural types lower through two functions:

```text
repr(Type)   -> JVM runtime class/interface
schema(Type) -> Rama schema form
```

Examples:

```text
repr(Struct)       = immutable map capability (normally IPersistentMap)
schema(Struct)     = fixed-keys-schema

repr(Map<K,V>)     = immutable map capability
schema(Map<K,V>)   = map-schema(schema(K), schema(V))

repr(Vector<T>)    = immutable indexed sequence capability
schema(Vector<T>)  = vector-schema(schema(T))
```

This distinction matters: Rama can serialize mutable `ArrayList`/`HashMap`,
but built-in paths operate on immutable Clojure data structures. Therefore
`Jvm<java.util.List<T>>` is not interchangeable with `Vector<T>` merely because
the runtime class implements `java.util.List`. Path compatibility is a
capability tracked by the semantic type.

## Typed backend boundary

After typed Rama IR, lowering splits:

```text
Typed Rama IR
  ├── CljExpr IR: fn/helper expressions, JVM calls, let/if/cond
  └── Flow IR: bindings, emissions, PState operations, branches, partitions
```

Flow IR cannot contain Clojure control macros. Complex expressions are lifted
to typed CljExpr helpers with explicit captures. Calling a helper from Flow IR
checks JVM argument assignability and binds its declared return type.

Flow operations carry emission cardinality separately from value types.
Paths are typed optics whose transfer functions update both focus type and
cardinality.

## Untyped Clojure crossings

There are only explicit crossings:

1. typed `extern` declarations for known Clojure/JVM functions;
2. `clojure { ... }` producing `Unknown` unless annotated;
3. an explicit assertion/cast from `Unknown`/`Dynamic` to a static type;
4. REST/depot inputs, where generated runtime contracts validate the declared
   event type before typed flow code runs.

JVM type hints improve interop/reflection performance but are not runtime
contracts. Boundary validators or explicit assertions provide runtime checks.
