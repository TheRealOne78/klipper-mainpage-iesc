use crate::*;
use axum::extract::Query;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use std::path::Path;
use tokio::fs;

/// Renders a markdown file to HTML. The content files ship with this repo and
/// aren't editable through any web-exposed path today, so this isn't
/// currently reachable as stored XSS — but the rendered HTML is still passed
/// through `ammonia` before being sent to the browser (which the frontend
/// injects via `dangerouslySetInnerHTML`), so raw HTML embedded in a `.md`
/// source can't smuggle `<script>`/event-handler attributes/etc. This is
/// defense-in-depth against a future "edit rules from the admin panel"
/// feature making the content admin-editable without anyone revisiting this
/// trust boundary.
pub(crate) async fn render_markdown_file(path: &Path) -> Result<String, std::io::Error> {
    let content = fs::read_to_string(path).await?;
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    let parser = Parser::new_ext(&content, options);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    Ok(ammonia::clean(&html_output))
}

#[utoipa::path(
    get,
    path = "/api/content/rules",
    params(
        ContentQuery
    ),
    responses(
        (status = 200, description = "Regulament printare in format HTML", body = ContentResponse)
    )
)]
pub(crate) async fn get_rules(Query(query): Query<ContentQuery>) -> Response {
    let filename = match query.lang.as_deref() {
        Some("en") => "content/rules_en.md",
        _ => "content/rules.md",
    };
    match render_markdown_file(&get_project_file_path(filename)).await {
        Ok(html) => Json(ContentResponse { html }).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

#[utoipa::path(
    get,
    path = "/api/content/troubleshooting",
    params(
        ContentQuery
    ),
    responses(
        (status = 200, description = "Instructiuni de depanare in format HTML", body = ContentResponse)
    )
)]
pub(crate) async fn get_troubleshooting(Query(query): Query<ContentQuery>) -> Response {
    let filename = match query.lang.as_deref() {
        Some("en") => "content/troubleshooting_en.md",
        _ => "content/troubleshooting.md",
    };
    match render_markdown_file(&get_project_file_path(filename)).await {
        Ok(html) => Json(ContentResponse { html }).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

