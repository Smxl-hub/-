import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Flame, Search, Plus, Bell, Settings, Trash2, 
  ExternalLink, RefreshCw, X, Check, AlertTriangle,
  Zap, TrendingUp, Twitter, Globe, Eye
} from 'lucide-react';
import { 
  keywordsApi, hotspotsApi, notificationsApi, triggerHotspotCheck,
  type Keyword, type Hotspot, type Stats, type Notification
} from './services/api';
import { onNewHotspot, onNotification, subscribeToKeywords } from './services/socket';

function App() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  
  const [newKeyword, setNewKeyword] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'keywords' | 'search'>('dashboard');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // 加载数据
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [keywordsData, hotspotsData, statsData, notifData] = await Promise.all([
        keywordsApi.getAll(),
        hotspotsApi.getAll({ limit: 20 }),
        hotspotsApi.getStats(),
        notificationsApi.getAll({ limit: 20 })
      ]);
      setKeywords(keywordsData);
      setHotspots(hotspotsData.data);
      setStats(statsData);
      setNotifications(notifData.data);
      setUnreadCount(notifData.unreadCount);

      // 订阅关键词
      const activeKeywords = keywordsData.filter(k => k.isActive).map(k => k.text);
      if (activeKeywords.length > 0) {
        subscribeToKeywords(activeKeywords);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // WebSocket 事件
  useEffect(() => {
    const unsubHotspot = onNewHotspot((hotspot) => {
      setHotspots(prev => [hotspot as Hotspot, ...prev.slice(0, 19)]);
      showToast('发现新热点: ' + hotspot.title.slice(0, 30), 'success');
      loadData();
    });

    const unsubNotif = onNotification(() => {
      setUnreadCount(prev => prev + 1);
    });

    return () => {
      unsubHotspot();
      unsubNotif();
    };
  }, [loadData]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 添加关键词
  const handleAddKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim()) return;

    try {
      const keyword = await keywordsApi.create({ text: newKeyword.trim() });
      setKeywords(prev => [keyword, ...prev]);
      setNewKeyword('');
      showToast('关键词添加成功', 'success');
      subscribeToKeywords([keyword.text]);
    } catch (error: any) {
      showToast(error.message || '添加失败', 'error');
    }
  };

  // 删除关键词
  const handleDeleteKeyword = async (id: string) => {
    try {
      await keywordsApi.delete(id);
      setKeywords(prev => prev.filter(k => k.id !== id));
      showToast('关键词已删除', 'success');
    } catch (error) {
      showToast('删除失败', 'error');
    }
  };

  // 切换关键词状态
  const handleToggleKeyword = async (id: string) => {
    try {
      const updated = await keywordsApi.toggle(id);
      setKeywords(prev => prev.map(k => k.id === id ? updated : k));
    } catch (error) {
      showToast('操作失败', 'error');
    }
  };

  // 手动搜索
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
      const result = await hotspotsApi.search(searchQuery);
      setHotspots(result.results);
      showToast(`找到 ${result.results.length} 条结果`, 'success');
    } catch (error) {
      showToast('搜索失败', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 手动触发检查
  const handleManualCheck = async () => {
    setIsChecking(true);
    try {
      await triggerHotspotCheck();
      showToast('热点检查已触发', 'success');
      setTimeout(loadData, 5000);
    } catch (error) {
      showToast('触发失败', 'error');
    } finally {
      setIsChecking(false);
    }
  };

  // 标记通知为已读
  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const getImportanceIcon = (importance: string) => {
    switch (importance) {
      case 'urgent': return <AlertTriangle className="w-4 h-4" />;
      case 'high': return <Flame className="w-4 h-4" />;
      case 'medium': return <Zap className="w-4 h-4" />;
      default: return <TrendingUp className="w-4 h-4" />;
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'twitter': return <Twitter className="w-4 h-4" />;
      default: return <Globe className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen">
      <div className="cyber-bg" />
      <div className="grid-bg" />

      {/* Toast 通知 */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg flex items-center gap-2 ${
              toast.type === 'success' 
                ? 'bg-green-500/20 border border-green-500/50 text-green-400' 
                : 'bg-red-500/20 border border-red-500/50 text-red-400'
            }`}
          >
            {toast.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0a0a0f]/80 border-b border-purple-500/20">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
                <Flame className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold neon-text">热点监控</h1>
                <p className="text-xs text-gray-500">AI 实时热点追踪</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={handleManualCheck}
                disabled={isChecking}
                className="neon-btn px-4 py-2 flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
                {isChecking ? '检查中...' : '立即检查'}
              </button>

              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {showNotifications && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="absolute right-0 top-12 w-80 neon-card p-4 max-h-96 overflow-y-auto"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold">通知</h3>
                        {unreadCount > 0 && (
                          <button onClick={handleMarkAllRead} className="text-xs text-purple-400 hover:text-purple-300">
                            全部已读
                          </button>
                        )}
                      </div>
                      {notifications.length === 0 ? (
                        <p className="text-gray-500 text-sm text-center py-4">暂无通知</p>
                      ) : (
                        <div className="space-y-2">
                          {notifications.map(n => (
                            <div key={n.id} className={`p-2 rounded-lg ${n.isRead ? 'opacity-60' : 'bg-purple-500/10'}`}>
                              <p className="text-sm font-medium">{n.title}</p>
                              <p className="text-xs text-gray-400 mt-1">{n.content.slice(0, 50)}...</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-4">
            {(['dashboard', 'keywords', 'search'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg transition-all ${
                  activeTab === tab 
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab === 'dashboard' && '仪表盘'}
                {tab === 'keywords' && '关键词'}
                {tab === 'search' && '搜索'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Dashboard */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <motion.div className="neon-card p-4" whileHover={{ scale: 1.02 }}>
                  <p className="text-gray-400 text-sm">总热点</p>
                  <p className="text-3xl font-bold neon-text">{stats.total}</p>
                </motion.div>
                <motion.div className="neon-card p-4" whileHover={{ scale: 1.02 }}>
                  <p className="text-gray-400 text-sm">今日新增</p>
                  <p className="text-3xl font-bold text-cyan-400">{stats.today}</p>
                </motion.div>
                <motion.div className="neon-card p-4" whileHover={{ scale: 1.02 }}>
                  <p className="text-gray-400 text-sm">紧急热点</p>
                  <p className="text-3xl font-bold text-red-400">{stats.urgent}</p>
                </motion.div>
                <motion.div className="neon-card p-4" whileHover={{ scale: 1.02 }}>
                  <p className="text-gray-400 text-sm">监控关键词</p>
                  <p className="text-3xl font-bold text-green-400">{keywords.filter(k => k.isActive).length}</p>
                </motion.div>
              </div>
            )}

            {/* Hotspots List */}
            <div className="neon-card p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
                最新热点
              </h2>
              
              {isLoading ? (
                <div className="text-center py-8 text-gray-400">加载中...</div>
              ) : hotspots.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  暂无热点，请添加关键词开始监控
                </div>
              ) : (
                <div className="space-y-3">
                  {hotspots.map((hotspot, index) => (
                    <motion.div
                      key={hotspot.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-all group"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`badge badge-${hotspot.importance}`}>
                              {getImportanceIcon(hotspot.importance)}
                              {hotspot.importance}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              {getSourceIcon(hotspot.source)}
                              {hotspot.source}
                            </span>
                            {hotspot.keyword && (
                              <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
                                {hotspot.keyword.text}
                              </span>
                            )}
                          </div>
                          <h3 className="font-medium mb-1 line-clamp-2">{hotspot.title}</h3>
                          {hotspot.summary && (
                            <p className="text-sm text-gray-400 line-clamp-2">{hotspot.summary}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              相关性 {hotspot.relevance}%
                            </span>
                            {hotspot.likeCount && (
                              <span>❤️ {hotspot.likeCount.toLocaleString()}</span>
                            )}
                            {hotspot.viewCount && (
                              <span>👁 {hotspot.viewCount.toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                        <a
                          href={hotspot.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Keywords */}
        {activeTab === 'keywords' && (
          <div className="space-y-6">
            <form onSubmit={handleAddKeyword} className="neon-card p-4 flex gap-3">
              <input
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="输入要监控的关键词..."
                className="neon-input flex-1"
              />
              <button type="submit" className="neon-btn px-4 py-2 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                添加
              </button>
            </form>

            <div className="grid gap-3">
              {keywords.map(keyword => (
                <motion.div
                  key={keyword.id}
                  layout
                  className="neon-card p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleKeyword(keyword.id)}
                      className={`w-10 h-6 rounded-full transition-colors relative ${
                        keyword.isActive ? 'bg-green-500' : 'bg-gray-600'
                      }`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        keyword.isActive ? 'left-5' : 'left-1'
                      }`} />
                    </button>
                    <span className={keyword.isActive ? '' : 'text-gray-500'}>{keyword.text}</span>
                    {keyword._count && (
                      <span className="text-xs text-gray-500">
                        {keyword._count.hotspots} 条热点
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteKeyword(keyword.id)}
                    className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            <form onSubmit={handleSearch} className="neon-card p-4 flex gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索热点内容..."
                className="neon-input flex-1"
              />
              <button type="submit" disabled={isLoading} className="neon-btn px-4 py-2 flex items-center gap-2">
                <Search className="w-4 h-4" />
                {isLoading ? '搜索中...' : '搜索'}
              </button>
            </form>

            <div className="space-y-3">
              {hotspots.map(hotspot => (
                <div key={hotspot.id} className="neon-card p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`badge badge-${hotspot.importance}`}>
                          {hotspot.importance}
                        </span>
                        <span className="text-xs text-gray-500">{hotspot.source}</span>
                      </div>
                      <h3 className="font-medium mb-2">{hotspot.title}</h3>
                      <p className="text-sm text-gray-400">{hotspot.content.slice(0, 200)}...</p>
                    </div>
                    <a
                      href={hotspot.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="neon-btn px-3 py-1 text-sm"
                    >
                      查看
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
