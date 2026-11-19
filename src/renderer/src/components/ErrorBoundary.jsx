import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.children !== this.props.children) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-8 rounded-md border-[3px] border-[#ff4444] bg-[#ffe6e6] p-8">
          <h2>Something went wrong</h2>
          <p>{this.state.error.message}</p>
          <button type="button" onClick={() => this.setState({ error: null })}>
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
