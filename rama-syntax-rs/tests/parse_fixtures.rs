use rama_syntax::{DiagnosticKind, analyze, parse};

fn fixture(name: &str) -> String {
    let path = format!("{}/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
    std::fs::read_to_string(path).expect("fixture")
}

#[test]
fn parses_match_create() {
    let src = fixture("match_create.rama");
    let file = parse(&src).unwrap_or_else(|e| {
        for d in &e.diagnostics {
            eprintln!("{}", d.render(&src));
        }
        panic!("parse failed");
    });
    assert!(file.items.len() >= 4, "schemas + ops");
}

#[test]
fn typechecks_match_create_clean() {
    let src = fixture("match_create.rama");
    let (_file, result) = analyze(&src).expect("parse");
    assert!(
        result.ok(),
        "unexpected diagnostics: {:?}",
        result
            .diagnostics
            .iter()
            .map(|d| d.message.as_str())
            .collect::<Vec<_>>()
    );
}

#[test]
fn parses_first_rama_subset() {
    let src = fixture("first.rama");
    let file = parse(&src).unwrap_or_else(|e| {
        for d in &e.diagnostics {
            eprintln!("{}", d.render(&src));
        }
        panic!("parse failed");
    });
    assert_eq!(file.items.len(), 1);
}

#[test]
fn bad_paths_emit_type_diagnostics() {
    let src = fixture("bad_paths.rama");
    let (_file, result) = analyze(&src).expect("parse");
    assert!(!result.ok());
    let msgs: Vec<_> = result
        .diagnostics
        .iter()
        .filter(|d| d.kind == DiagnosticKind::Type)
        .map(|d| d.message.as_str())
        .collect();
    assert!(
        msgs.iter().any(|m| m.contains("unknown field")),
        "expected unknown field: {msgs:?}"
    );
    assert!(
        msgs.iter().any(|m| m.contains("navigator") && m.contains("keypath")),
        "expected navigator-in-keypath: {msgs:?}"
    );
    assert!(
        msgs.iter().any(|m| m.contains("termval type mismatch")),
        "expected termval mismatch: {msgs:?}"
    );
    assert!(
        msgs.iter().any(|m| m.contains("unknown pstate")),
        "expected unknown pstate: {msgs:?}"
    );
}
