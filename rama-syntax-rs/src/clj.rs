//! Clojure / Rama dataflow IR.
//!
//! Compilation targets this layer; only [`render`] / [`Document::render`] produce source text.

use std::fmt;

/// One Clojure form. Rama ops are ordinary lists (`local-select>`, `<<if`, …).
#[derive(Debug, Clone, PartialEq)]
pub enum Form {
    Nil,
    Bool(bool),
    Int(i64),
    String(String),
    /// Bare symbol, including `*x`, `$$matches`, `local-select>`, `:>`, `|hash`.
    Symbol(String),
    /// Keyword without leading `:`.
    Keyword(String),
    List(Vec<Form>),
    Vector(Vec<Form>),
    Map(Vec<(Form, Form)>),
    /// Line comment (`;; …`). Only meaningful at document / body splice sites.
    Comment(String),
}

/// Top-level file: ordered forms (and comments).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Document {
    pub forms: Vec<Form>,
}

impl Document {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, form: Form) {
        self.forms.push(form);
    }

    pub fn render(&self) -> String {
        let mut out = String::new();
        for (i, form) in self.forms.iter().enumerate() {
            if i > 0 {
                out.push('\n');
                if !matches!(form, Form::Comment(_))
                    && !matches!(self.forms[i - 1], Form::Comment(_))
                {
                    out.push('\n');
                }
            }
            out.push_str(&render(form));
            if !matches!(form, Form::Comment(_)) {
                out.push('\n');
            } else if !out.ends_with('\n') {
                out.push('\n');
            }
        }
        out
    }
}

// --- constructors ----------------------------------------------------------

pub fn nil() -> Form {
    Form::Nil
}

pub fn bool(b: bool) -> Form {
    Form::Bool(b)
}

pub fn int(n: i64) -> Form {
    Form::Int(n)
}

pub fn string(s: impl Into<String>) -> Form {
    Form::String(s.into())
}

pub fn sym(s: impl Into<String>) -> Form {
    Form::Symbol(s.into())
}

pub fn kw(s: impl Into<String>) -> Form {
    Form::Keyword(s.into())
}

pub fn comment(s: impl Into<String>) -> Form {
    Form::Comment(s.into())
}

pub fn list(xs: impl IntoIterator<Item = Form>) -> Form {
    Form::List(xs.into_iter().collect())
}

pub fn vector(xs: impl IntoIterator<Item = Form>) -> Form {
    Form::Vector(xs.into_iter().collect())
}

pub fn map(entries: impl IntoIterator<Item = (Form, Form)>) -> Form {
    Form::Map(entries.into_iter().collect())
}

/// `(head a b c …)`
pub fn call(head: impl Into<String>, args: impl IntoIterator<Item = Form>) -> Form {
    let mut xs = vec![sym(head)];
    xs.extend(args);
    Form::List(xs)
}

impl Form {
    pub fn is_atom(&self) -> bool {
        matches!(
            self,
            Form::Nil
                | Form::Bool(_)
                | Form::Int(_)
                | Form::String(_)
                | Form::Symbol(_)
                | Form::Keyword(_)
        )
    }
}

impl fmt::Display for Form {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&render(self))
    }
}

// --- pretty printer --------------------------------------------------------

pub fn render(form: &Form) -> String {
    render_at(form, 0)
}

fn render_at(form: &Form, indent: usize) -> String {
    match form {
        Form::Nil => "nil".into(),
        Form::Bool(b) => b.to_string(),
        Form::Int(n) => n.to_string(),
        Form::String(s) => format!("{:?}", s),
        Form::Symbol(s) => s.clone(),
        Form::Keyword(k) => format!(":{k}"),
        Form::Comment(c) => {
            if c.starts_with(';') {
                format!("{}{}", pad(indent), c)
            } else {
                format!("{};; {c}", pad(indent))
            }
        }
        Form::Vector(xs) => render_delimited('[', ']', xs, indent, false),
        Form::List(xs) => render_list(xs, indent),
        Form::Map(entries) => render_map(entries, indent),
    }
}

fn render_list(xs: &[Form], indent: usize) -> String {
    if xs.is_empty() {
        return "()".into();
    }
    if should_block_list(xs) {
        render_block_list(xs, indent)
    } else {
        render_delimited('(', ')', xs, indent, false)
    }
}

fn should_block_list(xs: &[Form]) -> bool {
    let Some(Form::Symbol(head)) = xs.first() else {
        return xs.iter().any(|x| !x.is_atom());
    };
    matches!(
        head.as_str(),
        "ns" | "defn"
            | "deframaop"
            | "defmodule"
            | "declare-pstate"
            | "declare-depot"
            | "let"
            | "cond"
            | "do"
            | "if"
            | "<<if"
            | "<<sources"
            | "fixed-keys-schema"
            | "map-schema"
    ) || xs.len() > 4
        || xs
            .iter()
            .skip(1)
            .any(|x| matches!(x, Form::List(_) | Form::Map(_)) && !x.is_atom())
}

fn render_block_list(xs: &[Form], indent: usize) -> String {
    let p = pad(indent);
    let inner = pad(indent + 2);
    let head = render_at(&xs[0], 0);
    if xs.len() == 1 {
        return format!("({head})");
    }

    // `(head arg1\n  arg2\n  …)` — put first arg on same line when it's an atom/vector params.
    let mut out = format!("({head}");
    let mut i = 1;
    if let Some(first) = xs.get(1) {
        if first.is_atom() || matches!(first, Form::Vector(_)) {
            out.push(' ');
            out.push_str(&render_at(first, 0));
            i = 2;
        }
    }
    for x in &xs[i..] {
        out.push('\n');
        out.push_str(&inner);
        out.push_str(render_at(x, indent + 2).trim_start());
    }
    out.push(')');
    let _ = p;
    out
}

fn render_delimited(
    open: char,
    close: char,
    xs: &[Form],
    indent: usize,
    force_multi: bool,
) -> String {
    if xs.is_empty() {
        return format!("{open}{close}");
    }
    let compact: String = {
        let mut s = String::from(open);
        for (i, x) in xs.iter().enumerate() {
            if i > 0 {
                s.push(' ');
            }
            s.push_str(&render_at(x, 0));
        }
        s.push(close);
        s
    };
    if !force_multi && compact.len() <= 80 && xs.iter().all(|x| x.is_atom() || is_small(x)) {
        return compact;
    }
    let inner = pad(indent + 2);
    let mut out = String::from(open);
    for (i, x) in xs.iter().enumerate() {
        if i > 0 {
            out.push('\n');
            out.push_str(&inner);
        }
        out.push_str(render_at(x, indent + 2).trim_start());
    }
    out.push(close);
    out
}

fn render_map(entries: &[(Form, Form)], indent: usize) -> String {
    if entries.is_empty() {
        return "{}".into();
    }
    let compact = {
        let mut s = String::from('{');
        for (i, (k, v)) in entries.iter().enumerate() {
            if i > 0 {
                s.push(' ');
            }
            s.push_str(&render_at(k, 0));
            s.push(' ');
            s.push_str(&render_at(v, 0));
        }
        s.push('}');
        s
    };
    if compact.len() <= 80
        && entries
            .iter()
            .all(|(k, v)| (k.is_atom() || is_small(k)) && (v.is_atom() || is_small(v)))
    {
        return compact;
    }
    let inner = pad(indent + 1);
    let mut out = String::from('{');
    for (i, (k, v)) in entries.iter().enumerate() {
        if i > 0 {
            out.push('\n');
            out.push_str(&inner);
        }
        out.push_str(&render_at(k, indent + 1));
        out.push(' ');
        out.push_str(&render_at(v, indent + 1));
    }
    out.push('}');
    out
}

fn is_small(form: &Form) -> bool {
    match form {
        Form::List(xs) | Form::Vector(xs) => xs.len() <= 3 && xs.iter().all(Form::is_atom),
        Form::Map(es) => es.len() <= 2 && es.iter().all(|(k, v)| k.is_atom() && v.is_atom()),
        _ => form.is_atom(),
    }
}

fn pad(n: usize) -> String {
    " ".repeat(n)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_let_cond_shape() {
        let form = call(
            "let",
            [vector([sym("y"), call("inc", [sym("x")])]), sym("y")],
        );
        let s = render(&form);
        assert!(s.contains("let"), "{s}");
        assert!(s.contains("inc"), "{s}");
    }
}
