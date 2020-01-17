/**
 * @module PullLoader
 * @author nuintun
 * @license MIT
 * @see https://github.com/Broltes/react-touch-loader
 */

import styles from './index.module.less';

import React from 'react';
import propTypes from 'prop-types';
import classNames from 'classnames';

const STATS = {
  INIT: styles.stateInit,
  RESET: styles.stateReset,
  LOADING: styles.stateLoading,
  PULLING: styles.statePulling,
  REFRESHED: styles.stateRefreshed,
  REFRESHING: styles.stateRefreshing,
  ENOUGH: `${styles.statePulling} ${styles.enough}`
};

export const PROGRESS = {
  DISABLE: 0,
  START: 1,
  DONE: 2
};

// 拖拽的缓动公式 - easeOutSine
function easing(distance) {
  // Current time
  const t = distance;
  // BegInnIng value
  const b = 0;
  // Duration
  // 允许拖拽的最大距离
  const d = window.screen.availHeight;
  // Change In value
  // 提示标签最大有效拖拽距离
  const c = d / 3.5;

  return c * Math.sin((t / d) * (Math.PI / 2)) + b;
}

// Test via a getter in the options object to see
// if the passive property is accessed
let supportsPassive = false;

try {
  const options = Object.defineProperty({}, 'passive', {
    get: () => (supportsPassive = true)
  });

  window.addEventListener('test', null, options);
} catch (e) {
  // Do nothing
}

const willPreventDefault = supportsPassive ? { passive: false } : false;

// Pull to refresh
// Tap bottom to load more
export default class PullLoader extends React.PureComponent {
  static defaultProps = {
    overscan: 1,
    autoLoadMore: true,
    scrollThreshold: 0,
    refreshThreshold: 72,
    progress: PROGRESS.DISABLE,
    placeholder: <div className={styles.noData}>暂无数据</div>
  };

  /**
   * @property propTypes
   */
  static propTypes = {
    hasMore: propTypes.bool,
    onRefresh: propTypes.func,
    overscan: propTypes.number,
    onLoadMore: propTypes.func,
    autoLoadMore: propTypes.bool,
    data: propTypes.array.isRequired,
    scrollThreshold: propTypes.number,
    refreshThreshold: propTypes.number,
    children: propTypes.func.isRequired,
    rowHeight: propTypes.number.isRequired,
    placeholder: propTypes.oneOfType([propTypes.string, propTypes.element]),
    progress: propTypes.oneOf([PROGRESS.DISABLE, PROGRESS.START, PROGRESS.DONE])
  };

  state = {
    range: [0, 0],
    pullHeight: 0,
    status: STATS.INIT
  };

  initialTouch = {
    clientY: 0,
    scrollTop: 0
  };

  viewportRef = React.createRef();

  bodyRef = React.createRef();

  get scrollTop() {
    return this.viewportRef.current.scrollTop;
  }

  set scrollTop(scrollTop) {
    this.viewportRef.current.scrollTop = scrollTop;
  }

  getVisibleRange() {
    const { viewportRef } = this;
    const { rowHeight, overscan } = this.props;

    const viewport = viewportRef.current;
    const scrollHeight = viewport.scrollTop;
    const containerHeight = viewport.clientHeight;

    const start = Math.max(0, Math.floor(scrollHeight / rowHeight) - overscan);
    const end = start + Math.ceil(containerHeight / rowHeight) + overscan + 1;

    return [start, end];
  }

  updateRange() {
    const { range } = this.state;
    const [prevStart, prevEnd] = range;
    const [start, end] = this.getVisibleRange();

    if (start !== prevStart || end !== prevEnd) {
      this.setState({ range: [start, end] });
    }
  }

  getVisibleItems() {
    const { data } = this.props;
    const { range } = this.state;

    const [start, end] = range;

    return data.slice(start, end);
  }

  getClassName() {
    const { status } = this.state;
    const { className, progress } = this.props;

    return classNames(className, styles.pLoader, status, {
      [styles.pLoaderProgress]: progress !== PROGRESS.DISABLE,
      [styles.progressCompleted]: progress === PROGRESS.DONE
    });
  }

  getSymbolStyle() {
    const { pullHeight } = this.state;

    if (pullHeight) {
      const height = Math.max(48, pullHeight);

      return { height, lineHeight: `${height}px` };
    }
  }

  getBodyStyle() {
    const { pullHeight } = this.state;
    const { data, rowHeight } = this.props;

    const minHeight = data.length * rowHeight;

    if (pullHeight) {
      const transform = `translate3d(0, ${pullHeight}px, 0)`;

      return { minHeight, transform };
    }

    return { minHeight };
  }

  getViewStyle() {
    const [start] = this.state.range;
    const { rowHeight } = this.props;

    const transform = `translate3d(0, ${start * rowHeight}px, 0)`;

    return { transform };
  }

  canLoad() {
    const { status } = this.state;

    return status !== STATS.REFRESHING && status !== STATS.LOADING;
  }

  canLoadMore() {
    const { hasMore, onLoadMore } = this.props;

    return hasMore && onLoadMore && this.canLoad();
  }

  canRefresh() {
    const { onRefresh } = this.props;

    return onRefresh && this.canLoad();
  }

  calculateDistance(touch) {
    return touch.clientY - this.initialTouch.clientY;
  }

  loadMore = () => {
    this.setState({ status: STATS.LOADING });
    this.props.onLoadMore(() => this.setState({ status: STATS.INIT }));
  };

  onTouchStart = e => {
    if (this.canRefresh() && e.touches.length === 1) {
      const { scrollTop } = this.viewportRef.current;

      this.initialTouch = { scrollTop, clientY: e.touches[0].clientY };
    }
  };

  onTouchMove = e => {
    if (e.cancelable && this.canRefresh()) {
      const { refreshThreshold } = this.props;
      const { scrollTop } = this.viewportRef.current;
      const distance = this.calculateDistance(e.touches[0]);

      if (distance > 0 && scrollTop <= 0) {
        let pullDistance = distance - this.initialTouch.scrollTop;

        if (pullDistance < 0) {
          // 修复 webview 滚动过程中 touchstart 时计算 viewport.scrollTop 不准
          pullDistance = 0;

          this.initialTouch.scrollTop = distance;
        }

        const pullHeight = easing(pullDistance);

        // 减弱滚动
        pullHeight && e.preventDefault();

        this.setState({ pullHeight, status: pullHeight >= refreshThreshold ? STATS.ENOUGH : STATS.PULLING });
      }
    }
  };

  onTouchEnd = () => {
    if (this.canRefresh()) {
      if (this.state.status === STATS.ENOUGH) {
        // Refreshing
        this.setState({ pullHeight: 0, status: STATS.REFRESHING });
      } else if (!this.viewportRef.current.scrollTop) {
        // Reset
        this.setState({ pullHeight: 0, status: STATS.RESET });
      } else {
        this.setState({ pullHeight: 0, status: STATS.INIT });
      }
    }
  };

  onScroll = () => {
    this.updateRange();

    const { autoLoadMore, scrollThreshold } = this.props;

    if (autoLoadMore && this.canLoadMore()) {
      const viewport = this.viewportRef.current;
      const scrollBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;

      scrollBottom <= scrollThreshold && this.loadMore();
    }
  };

  onTransitionEnd = e => {
    // Only body self transition can trigger events
    if (e.target === this.bodyRef.current) {
      switch (this.state.status) {
        // Trigger refresh action
        case STATS.REFRESHING:
          this.props.onRefresh(
            () => {
              this.setState({ pullHeight: 0, status: STATS.REFRESHED });
              // Close success message after 300ms
              setTimeout(() => this.setState({ status: STATS.INIT }), 300);
            },
            () => this.setState({ pullHeight: 0, status: STATS.RESET })
          );
          break;
        case STATS.RESET:
          this.setState({ status: STATS.INIT });
          break;
      }
    }
  };

  componentDidMount() {
    const { viewportRef } = this;
    const { autoLoadMore } = this.props;

    autoLoadMore && this.canLoadMore() && this.loadMore();

    this.initialTouch.scrollTop = viewportRef.current.scrollTop;

    viewportRef.current.addEventListener('touchstart', this.onTouchStart, willPreventDefault);
    viewportRef.current.addEventListener('touchmove', this.onTouchMove, willPreventDefault);
    viewportRef.current.addEventListener('touchend', this.onTouchEnd, willPreventDefault);
    viewportRef.current.addEventListener('touchcancel', this.onTouchEnd, willPreventDefault);

    this.updateRange();
  }

  componentWillUnmount() {
    const { viewportRef } = this;

    viewportRef.current.removeEventListener('touchstart', this.onTouchStart);
    viewportRef.current.removeEventListener('touchmove', this.onTouchMove);
    viewportRef.current.removeEventListener('touchend', this.onTouchEnd);
    viewportRef.current.removeEventListener('touchcancel', this.onTouchEnd);
  }

  render() {
    const { data, style, children, hasMore, placeholder } = this.props;

    return (
      <div style={style} className={this.getClassName()}>
        <div className={styles.pLoaderSymbol} style={this.getSymbolStyle()}>
          <div className={styles.pLoaderMsg}>
            <i />
          </div>
          <div className={styles.pLoaderLoading}>
            <i className={styles.spinning} />
          </div>
        </div>
        <div ref={this.viewportRef} onScroll={this.onScroll} className={styles.pLoaderScroller}>
          <div
            ref={this.bodyRef}
            style={this.getBodyStyle()}
            className={styles.pLoaderBody}
            onTransitionEnd={this.onTransitionEnd}
          >
            <div style={this.getViewStyle()}>
              {data.length ? this.getVisibleItems().map(children) : hasMore ? null : placeholder}
              {hasMore && (
                <div className={styles.pLoaderFooter}>
                  <div className={styles.pLoaderBtn} onClick={this.loadMore} />
                  <div className={styles.pLoaderLoading}>
                    <i className={styles.spinning} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
