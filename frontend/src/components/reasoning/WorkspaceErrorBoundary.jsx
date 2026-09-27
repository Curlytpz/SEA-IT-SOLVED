import { Component } from 'react';
import { Link } from 'react-router-dom';
import { Btn, Card } from '../ui';

export default class WorkspaceErrorBoundary extends Component {
  state = { error: null, revision: 0 };

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, info) {
    console.error('[LessonWorkspace] Unexpected render failure', {
      name: error?.name,
      message: import.meta.env.DEV ? error?.message : 'Workspace render failed',
      componentStack: import.meta.env.DEV ? info?.componentStack : undefined,
    });
  }

  retry = () => this.setState(current => ({ error: null, revision: current.revision + 1 }));

  render() {
    if (!this.state.error) return <div key={this.state.revision}>{this.props.children}</div>;
    return <Card className="mx-auto max-w-2xl p-6" role="alert">
      <h1 className="text-xl font-bold text-foreground">Something went wrong loading this workspace.</h1>
      <p className="mt-2 text-sm text-muted-foreground">Your lesson data was not changed. Retry the workspace or return to Lessons.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Btn onClick={this.retry}>Retry</Btn>
        <Link to={this.props.backTo || '/instructor/sections'}><Btn variant="secondary">Back to Lessons</Btn></Link>
      </div>
    </Card>;
  }
}
