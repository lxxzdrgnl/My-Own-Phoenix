import click
import asyncio
import httpx
import hashlib
from .client import run_connector


def fetch_projects(key, saas_url):
    """Fetch user's projects using connector key."""
    # Convert wss:// to https://
    http_url = saas_url.replace("wss://", "https://").replace("ws://", "http://")
    key_hash = hashlib.sha256(key.encode()).hexdigest()

    try:
        resp = httpx.get(
            f"{http_url}/api/connectors/projects",
            params={"keyHash": key_hash},
            timeout=10,
        )
        if resp.status_code == 200:
            return resp.json().get("projects", [])
        else:
            return None
    except Exception:
        return None


def select_project(projects):
    """Interactive project selection."""
    click.echo("")
    click.echo("  Available projects:")
    click.echo("")
    for i, p in enumerate(projects, 1):
        role_badge = f"[{p.get('role', '?')}]"
        click.echo(f"  {i}. {p['name']} {click.style(role_badge, dim=True)}")
    click.echo("")

    while True:
        choice = click.prompt("  Select project", type=int)
        if 1 <= choice <= len(projects):
            return projects[choice - 1]
        click.echo(f"  Invalid choice. Enter 1-{len(projects)}")


@click.command()
@click.option("--key", required=True, help="Connector key (pc_*)")
@click.option("--agent", required=True, help="Local agent URL (e.g. http://localhost:2024)")
@click.option("--project", default=None, help="Project slug (optional — will prompt if omitted)")
@click.option("--type", "agent_type", default="langgraph", help="Agent type: langgraph or rest")
@click.option("--assistant-id", default="agent", help="LangGraph assistant ID")
@click.option("--saas-url", default="wss://phoenix.rheon.kr", help="SaaS WebSocket URL")
def main(key, agent, project, agent_type, assistant_id, saas_url):
    """Connect your local agent to My Own Phoenix SaaS."""
    click.echo(f"Phoenix Connector v0.1.0")

    # If no project specified, fetch list and let user choose
    if not project:
        click.echo("Fetching projects...")
        projects = fetch_projects(key, saas_url)
        if projects is None:
            click.echo(click.style("  Failed to fetch projects. Use --project flag instead.", fg="red"))
            return
        if not projects:
            click.echo("  No projects found. Create one at the dashboard first.")
            return

        selected = select_project(projects)
        project = selected["slug"]
        click.echo(f"  Selected: {selected['name']}")
        click.echo("")

    click.echo(f"Agent: {agent} ({agent_type})")
    click.echo(f"Project: {project}")
    click.echo(f"SaaS: {saas_url}")
    click.echo("")
    asyncio.run(run_connector(key, agent, project, agent_type, assistant_id, saas_url))


if __name__ == "__main__":
    main()
