import click
import asyncio
import httpx
import hashlib
from .client import run_connector


def fetch_projects(key, saas_url):
    """Fetch user's projects using connector key."""
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
@click.option("--key", default=None, help="Connector key (pc_*)")
@click.option("--agent", default=None, help="Local agent URL (e.g. http://localhost:2024)")
@click.option("--project", default=None, help="Project slug (optional)")
@click.option("--type", "agent_type", default=None, help="Agent type: langgraph or rest")
@click.option("--assistant-id", default=None, help="LangGraph assistant ID")
@click.option("--saas-url", default=None, help="SaaS WebSocket URL")
def main(key, agent, project, agent_type, assistant_id, saas_url):
    """Connect your local agent to My Own Phoenix."""
    click.echo("Phoenix Connector v0.1.0")
    click.echo("")

    # Interactive prompts for missing args
    if not key:
        key = click.prompt("  Connector key (pc_*)")
    if not key.startswith("pc_"):
        click.echo(click.style("  Invalid key format. Must start with pc_", fg="red"))
        return

    if not saas_url:
        saas_url = "wss://phoenix.rheon.kr"

    if not agent:
        agent = click.prompt("  Agent URL", default="http://localhost:2024")

    if not agent_type:
        click.echo("")
        click.echo("  Agent type:")
        click.echo("    1. langgraph")
        click.echo("    2. rest")
        choice = click.prompt("  Select", type=int, default=1)
        agent_type = "rest" if choice == 2 else "langgraph"

    if agent_type == "langgraph" and not assistant_id:
        assistant_id = click.prompt("  Assistant ID", default="agent")
    elif not assistant_id:
        assistant_id = "agent"

    if not project:
        click.echo("")
        click.echo("  Fetching projects...")
        projects = fetch_projects(key, saas_url)
        if projects is None:
            click.echo(click.style("  Failed to fetch projects.", fg="red"))
            project = click.prompt("  Enter project slug manually")
        elif not projects:
            click.echo("  No projects found. Create one at the dashboard first.")
            return
        else:
            selected = select_project(projects)
            project = selected["slug"]
            click.echo(f"  → {selected['name']}")

    click.echo("")
    click.echo(f"  Agent:   {agent} ({agent_type})")
    click.echo(f"  Project: {project}")
    click.echo(f"  SaaS:    {saas_url}")
    click.echo("")

    asyncio.run(run_connector(key, agent, project, agent_type, assistant_id, saas_url))


if __name__ == "__main__":
    main()
