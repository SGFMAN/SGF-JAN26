import React from "react";

/** Catches overlay render errors so the basemap + pin stay visible. Resets on new search. */
export default class MapSectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error, info) {
    console.error("[MapSectionErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}
