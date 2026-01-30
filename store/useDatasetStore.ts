import { create } from 'zustand';
import { persist, PersistStorage, StorageValue } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import {
  Dataset,
  DatasetImage,
  DatasetStats,
  DatasetFilter,
  DatasetViewMode,
  PartCategory,
  DefectType,
  AnnotationStatus,
  ExportFormat,
  ExportConfig,
  StoredAnnotation,
  StoredMask
} from '../types/dataset';

// ============== 后端 API 配置 ==============
const DATASET_API_URL = 'http://localhost:5002';

// API 调用函数（后台同步，不阻塞前端）
const syncToBackend = {
  createDataset: async (data: {
    id: string;
    name: string;
    description: string;
    partCategory: PartCategory;
    partCode?: string;
    defectTypes: DefectType[];
  }) => {
    try {
      const response = await fetch(`${DATASET_API_URL}/datasets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        console.warn('[Dataset API] 创建数据集失败:', await response.text());
      } else {
        console.log('[Dataset API] ✅ 数据集已同步到文件系统');
      }
    } catch (error) {
      console.warn('[Dataset API] 创建数据集失败 (服务可能未启动):', error);
    }
  },

  deleteDataset: async (id: string) => {
    try {
      const response = await fetch(`${DATASET_API_URL}/datasets/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        console.warn('[Dataset API] 删除数据集失败:', await response.text());
      } else {
        console.log('[Dataset API] ✅ 数据集已从文件系统删除');
      }
    } catch (error) {
      console.warn('[Dataset API] 删除数据集失败 (服务可能未启动):', error);
    }
  },

  addImages: async (datasetId: string, images: Array<{
    filename: string;
    url: string;
    width: number;
    height: number;
  }>) => {
    try {
      const response = await fetch(`${DATASET_API_URL}/datasets/${datasetId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images })
      });
      if (!response.ok) {
        console.warn('[Dataset API] 添加图片失败:', await response.text());
      } else {
        console.log(`[Dataset API] ✅ ${images.length} 张图片已同步到文件系统`);
      }
    } catch (error) {
      console.warn('[Dataset API] 添加图片失败 (服务可能未启动):', error);
    }
  },

  saveAnnotations: async (datasetId: string, imageId: string, annotations: StoredAnnotation[], masks: StoredMask[], defectTypes: DefectType[]) => {
    try {
      const response = await fetch(`${DATASET_API_URL}/datasets/${datasetId}/images/${imageId}/annotations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations, masks, defectTypes })
      });
      if (!response.ok) {
        console.warn('[Dataset API] 保存标注失败:', await response.text());
      } else {
        console.log('[Dataset API] ✅ 标注已同步到文件系统');
      }
    } catch (error) {
      console.warn('[Dataset API] 保存标注失败 (服务可能未启动):', error);
    }
  },

  removeImage: async (datasetId: string, imageId: string) => {
    try {
      const response = await fetch(`${DATASET_API_URL}/datasets/${datasetId}/images/${imageId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        console.warn('[Dataset API] 删除图片失败:', await response.text());
      } else {
        console.log('[Dataset API] ✅ 图片已从文件系统删除');
      }
    } catch (error) {
      console.warn('[Dataset API] 删除图片失败 (服务可能未启动):', error);
    }
  }
};

// IndexedDB 存储实现
const DB_NAME = 'lichain-dataset-db';
const DB_VERSION = 2; // 升级版本号，确保触发 upgrade
const STORE_NAME = 'zustand-store';

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

const getDB = (): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise((resolve, reject) => {
    console.log('[IndexedDB] 开始连接数据库...');
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[IndexedDB] 连接失败:', request.error);
      dbInitPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      console.log('[IndexedDB] 连接成功');
      dbInstance = request.result;

      dbInstance.onclose = () => {
        console.warn('[IndexedDB] 数据库连接意外关闭');
        dbInstance = null;
        dbInitPromise = null;
      };

      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      console.log(`[IndexedDB] 数据库升级: v${event.oldVersion} -> v${event.newVersion}`);
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });

  return dbInitPromise;
};

// 自定义持久化存储适配器
const createIndexedDBStorage = <S>(): PersistStorage<S> => ({
  getItem: async (name: string): Promise<StorageValue<S> | null> => {
    console.log(`[IndexedDB] 正在读取数据: ${name}`);
    try {
      const db = await getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(name);

        request.onsuccess = () => {
          let result = request.result;

          if (result !== undefined) {
            // 兼容性处理：如果读取到的是字符串（旧版本数据），尝试解析
            if (typeof result === 'string') {
              console.log(`[IndexedDB] 检测到旧版本字符串数据，尝试解析: ${name}`);
              try {
                result = JSON.parse(result);
                // 顺便更新回数据库为对象格式
                const writeTx = db.transaction(STORE_NAME, 'readwrite');
                writeTx.objectStore(STORE_NAME).put(result, name);
              } catch (e) {
                console.error('[IndexedDB] 旧数据解析失败:', e);
                result = null;
              }
            }

            if (result) {
              // 简单估算大小
              const size = JSON.stringify(result).length;
              console.log(`[IndexedDB] 读取成功: ${name}, 大约 ${Math.round(size / 1024)} KB`);
              resolve(result as StorageValue<S>);
              return;
            }
          }

          console.log(`[IndexedDB] 未找到数据: ${name}，尝试从 localStorage 迁移`);
          const localData = localStorage.getItem(name);
          if (localData) {
            try {
              const parsedData = JSON.parse(localData);
              getDB().then(d => {
                const t = d.transaction(STORE_NAME, 'readwrite');
                t.objectStore(STORE_NAME).put(parsedData, name);
                console.log(`[IndexedDB] 迁移完成: ${name}`);
              });
              resolve(parsedData as StorageValue<S>);
            } catch (err) {
              console.error('[IndexedDB] localStorage 数据解析失败:', err);
              resolve(null);
            }
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          console.error('[IndexedDB] 读取出错:', request.error);
          resolve(null);
        };
      });
    } catch (e) {
      console.error('[IndexedDB] 获取数据库失败:', e);
      return null;
    }
  },
  // ... setItem 和 removeItem 保持不变 ...
  setItem: async (name: string, value: StorageValue<S>): Promise<void> => {
    // console.log(`[IndexedDB] 正在保存数据: ${name}`); // 减少日志噪音
    try {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(value, name);

        request.onsuccess = () => {
          // console.log(`[IndexedDB] 保存成功: ${name}`);
          try { localStorage.removeItem(name); } catch { }
          resolve();
        };

        request.onerror = () => {
          console.error('[IndexedDB] 保存失败:', request.error);
          reject(request.error);
        };
      });
    } catch (e) {
      console.error('[IndexedDB] 保存过程出错:', e);
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(name);
    } catch (e) {
      console.error('[IndexedDB] 删除失败:', e);
    }
    try { localStorage.removeItem(name); } catch { }
  }
});

interface DatasetState {
  _hasHydrated: boolean; // 新增状态，标记是否已完成数据恢复
  setHasHydrated: (state: boolean) => void;

  // 数据
  datasets: Dataset[];
  // ... 其他字段保持不变 ...
  currentDatasetId: string | null;
  filter: DatasetFilter;
  viewMode: DatasetViewMode;

  // 计算属性
  getCurrentDataset: () => Dataset | null;
  getFilteredDatasets: () => Dataset[];
  getFilteredImages: () => DatasetImage[];

  // 数据集操作
  createDataset: (data: {
    name: string;
    description: string;
    partCategory: PartCategory;
    partCode?: string;
    defectTypes: DefectType[];
  }) => string;
  updateDataset: (id: string, data: Partial<Dataset>) => void;
  deleteDataset: (id: string) => void;
  setCurrentDataset: (id: string | null) => void;

  // 图片操作
  addImages: (datasetId: string, images: Array<{
    filename: string;
    url: string;
    width: number;
    height: number;
  }>) => void;
  updateImageAnnotation: (datasetId: string, imageId: string, data: {
    isAnnotated: boolean;
    annotationCount: number;
    defectTypes: DefectType[];
    annotations?: StoredAnnotation[];
    masks?: StoredMask[];
  }) => void;
  saveImageAnnotations: (datasetId: string, imageId: string, annotations: StoredAnnotation[], masks: StoredMask[]) => void;
  removeImage: (datasetId: string, imageId: string) => void;

  // 筛选
  setFilter: (filter: Partial<DatasetFilter>) => void;
  clearFilter: () => void;
  setViewMode: (mode: DatasetViewMode) => void;

  // 统计更新
  recalculateStats: (datasetId: string) => void;

  // 后端同步
  fetchDatasets: () => Promise<void>;
  fetchDatasetDetails: (datasetId: string) => Promise<void>;
}

// 计算数据集统计信息
const calculateStats = (images: DatasetImage[]): DatasetStats => {
  const annotatedImages = images.filter(img => img.isAnnotated);
  const defectDistribution: Record<DefectType, number> = {} as Record<DefectType, number>;

  // 初始化所有缺陷类型为0
  Object.values(DefectType).forEach(type => {
    defectDistribution[type] = 0;
  });

  // 统计各缺陷类型
  annotatedImages.forEach(img => {
    img.defectTypes.forEach(type => {
      defectDistribution[type] = (defectDistribution[type] || 0) + 1;
    });
  });

  const totalAnnotations = images.reduce((sum, img) => sum + img.annotationCount, 0);

  return {
    totalImages: images.length,
    annotatedImages: annotatedImages.length,
    unannotatedImages: images.length - annotatedImages.length,
    completionRate: images.length > 0 ? Math.round((annotatedImages.length / images.length) * 100) : 0,
    totalAnnotations,
    defectDistribution
  };
};

// 判断数据集标注状态
const getAnnotationStatus = (stats: DatasetStats): AnnotationStatus => {
  if (stats.annotatedImages === 0) return AnnotationStatus.NOT_STARTED;
  if (stats.annotatedImages === stats.totalImages) return AnnotationStatus.COMPLETED;
  return AnnotationStatus.IN_PROGRESS;
};

export const useDatasetStore = create<DatasetState>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),

      datasets: [],
      currentDatasetId: null,
      filter: {},
      viewMode: DatasetViewMode.ALL,

      // 获取当前数据集
      getCurrentDataset: () => {
        const { datasets, currentDatasetId } = get();
        if (!currentDatasetId) return null;
        return datasets.find(d => d.id === currentDatasetId) || null;
      },

      // 获取筛选后的数据集列表
      getFilteredDatasets: () => {
        const { datasets, filter } = get();

        return datasets.filter(dataset => {
          // 按零件筛选
          if (filter.partCategory && dataset.partCategory !== filter.partCategory) {
            return false;
          }

          // 按缺陷类型筛选
          if (filter.defectTypes && filter.defectTypes.length > 0) {
            const hasMatchingDefect = filter.defectTypes.some(type =>
              dataset.defectTypes.includes(type)
            );
            if (!hasMatchingDefect) return false;
          }

          // 按标注状态筛选
          if (filter.annotationStatus) {
            const status = getAnnotationStatus(dataset.stats);
            if (status !== filter.annotationStatus) return false;
          }

          // 按搜索文本筛选
          if (filter.searchText) {
            const searchLower = filter.searchText.toLowerCase();
            const nameMatch = dataset.name.toLowerCase().includes(searchLower);
            const descMatch = dataset.description.toLowerCase().includes(searchLower);
            if (!nameMatch && !descMatch) return false;
          }

          return true;
        });
      },

      // 获取当前数据集的筛选后图片
      getFilteredImages: () => {
        const { viewMode } = get();
        const dataset = get().getCurrentDataset();
        if (!dataset) return [];

        switch (viewMode) {
          case DatasetViewMode.ANNOTATED:
            return dataset.images.filter(img => img.isAnnotated);
          case DatasetViewMode.UNANNOTATED:
            return dataset.images.filter(img => !img.isAnnotated);
          default:
            return dataset.images;
        }
      },

      // 创建数据集
      createDataset: (data) => {
        const id = uuidv4().slice(0, 8); // 使用短 ID，与后端一致
        const now = new Date().toISOString();

        const newDataset: Dataset = {
          id,
          name: data.name,
          description: data.description,
          partCategory: data.partCategory,
          partCode: data.partCode,
          defectTypes: data.defectTypes,
          images: [],
          stats: {
            totalImages: 0,
            annotatedImages: 0,
            unannotatedImages: 0,
            completionRate: 0,
            totalAnnotations: 0,
            defectDistribution: {} as Record<DefectType, number>
          },
          createdAt: now,
          updatedAt: now
        };

        set(state => ({
          datasets: [...state.datasets, newDataset]
        }));

        // 同步到后端文件系统
        syncToBackend.createDataset({
          id,
          name: data.name,
          description: data.description,
          partCategory: data.partCategory,
          partCode: data.partCode,
          defectTypes: data.defectTypes
        });

        return id;
      },

      // 更新数据集
      updateDataset: (id, data) => {
        set(state => ({
          datasets: state.datasets.map(dataset =>
            dataset.id === id
              ? { ...dataset, ...data, updatedAt: new Date().toISOString() }
              : dataset
          )
        }));
      },

      // 删除数据集
      deleteDataset: (id) => {
        set(state => ({
          datasets: state.datasets.filter(d => d.id !== id),
          currentDatasetId: state.currentDatasetId === id ? null : state.currentDatasetId
        }));

        // 同步删除后端文件
        syncToBackend.deleteDataset(id);
      },

      // 设置当前数据集
      setCurrentDataset: (id) => {
        set({ currentDatasetId: id });
        // 异步获取详细信息（包含标注）
        if (id) {
          get().fetchDatasetDetails(id);
        }
      },

      // 添加图片到数据集
      addImages: (datasetId, images) => {
        const now = new Date().toISOString();

        const newImages: DatasetImage[] = images.map(img => ({
          id: uuidv4().slice(0, 8), // 使用短 ID
          filename: img.filename,
          url: img.url,
          width: img.width,
          height: img.height,
          isAnnotated: false,
          annotationCount: 0,
          defectTypes: [],
          annotations: [],
          masks: [],
          createdAt: now,
          updatedAt: now
        }));

        set(state => ({
          datasets: state.datasets.map(dataset => {
            if (dataset.id !== datasetId) return dataset;

            const updatedImages = [...dataset.images, ...newImages];
            return {
              ...dataset,
              images: updatedImages,
              stats: calculateStats(updatedImages),
              updatedAt: now
            };
          })
        }));

        // 同步到后端文件系统（保存原始图片）
        syncToBackend.addImages(datasetId, images);
      },

      // 更新图片标注信息
      updateImageAnnotation: (datasetId, imageId, data) => {
        const now = new Date().toISOString();

        set(state => ({
          datasets: state.datasets.map(dataset => {
            if (dataset.id !== datasetId) return dataset;

            const updatedImages = dataset.images.map(img =>
              img.id === imageId
                ? {
                  ...img,
                  ...data,
                  annotations: data.annotations !== undefined ? data.annotations : img.annotations,
                  masks: data.masks !== undefined ? data.masks : img.masks,
                  updatedAt: now
                }
                : img
            );

            return {
              ...dataset,
              images: updatedImages,
              stats: calculateStats(updatedImages),
              updatedAt: now
            };
          })
        }));
      },

      // 保存图片的标注数据
      saveImageAnnotations: (datasetId, imageId, annotations, masks) => {
        const now = new Date().toISOString();
        let defectTypes: DefectType[] = [];

        set(state => ({
          datasets: state.datasets.map(dataset => {
            if (dataset.id !== datasetId) return dataset;

            const updatedImages = dataset.images.map(img => {
              if (img.id !== imageId) return img;

              const isAnnotated = annotations.length > 0 || masks.length > 0;
              // 从标注中提取缺陷类型
              const annotationLabels = annotations.map(a => a.label);
              const maskLabels = masks.map(m => m.label);
              defectTypes = [...new Set([...annotationLabels, ...maskLabels])] as DefectType[];

              return {
                ...img,
                annotations,
                masks,
                isAnnotated,
                annotationCount: annotations.length + masks.length,
                defectTypes,
                updatedAt: now
              };
            });

            return {
              ...dataset,
              images: updatedImages,
              stats: calculateStats(updatedImages),
              updatedAt: now
            };
          })
        }));

        // 同步标注到后端文件系统
        syncToBackend.saveAnnotations(datasetId, imageId, annotations, masks, defectTypes);
      },

      // 移除图片
      removeImage: (datasetId, imageId) => {
        const now = new Date().toISOString();

        set(state => ({
          datasets: state.datasets.map(dataset => {
            if (dataset.id !== datasetId) return dataset;

            const updatedImages = dataset.images.filter(img => img.id !== imageId);
            return {
              ...dataset,
              images: updatedImages,
              stats: calculateStats(updatedImages),
              updatedAt: now
            };
          })
        }));

        // 同步删除后端文件
        syncToBackend.removeImage(datasetId, imageId);
      },

      // 设置筛选条件
      setFilter: (filter) => {
        set(state => ({
          filter: { ...state.filter, ...filter }
        }));
      },

      // 清除筛选
      clearFilter: () => {
        set({ filter: {} });
      },

      // 设置视图模式
      setViewMode: (mode) => {
        set({ viewMode: mode });
      },

      // 重新计算统计
      recalculateStats: (datasetId) => {
        set(state => ({
          datasets: state.datasets.map(dataset => {
            if (dataset.id !== datasetId) return dataset;
            return {
              ...dataset,
              stats: calculateStats(dataset.images),
              updatedAt: new Date().toISOString()
            };
          })
        }));
      },

      // 从后端获取数据集列表
      fetchDatasets: async () => {
        try {
          const response = await fetch(`${DATASET_API_URL}/datasets`);
          if (response.ok) {
            const data = await response.json();
            const allDatasets = data.datasets || [];
            
            // 过滤掉音频数据集，只保留图像数据集
            const backendDatasets = allDatasets.filter((ds: any) => 
              ds.datasetType !== 'audio' && ds.projectType !== 'audio-anomaly'
            );

            // 简单策略：以某些字段更新本地，或者完全替换
            // 为了保留本地可能未同步的状态，我们合并
            // 但鉴于 createDataset 都是同步的，我们可以尝试合并

            set(state => {
              // 建立现有数据集的映射
              const localMap = new Map(state.datasets.map(d => [d.id, d]));

              const newDatasets = backendDatasets.map((bd: any) => {
                const local = localMap.get(bd.id);
                // 如果本地有，保留本地的 images (可能包含未保存的标注)，但更新 metadata
                if (local) {
                  return {
                    ...local,
                    ...bd, // 更新名称、描述等
                    stats: bd.stats || local.stats,
                    // images: local.images // 保留本地图片列表? 
                    // 不，如果后端有新图片（如导入），本地应该更新
                    // 但是本地标注可能比后端新？
                    // 这是一个经典的同步问题。
                    // 鉴于我们主要处理“导入默认数据”，后端是 Source.
                    // 我们应该信任后端的元数据和图片列表

                    // 特殊处理：如果后端 images 为空但本地有，可能是后端没返回完整列表（list 接口通常不返回 images）
                    // 检查 dataset_server.py 的 list_all_datasets -> load_dataset_metadata -> returns FULL metadata (including images)
                    // 是的，load_dataset_metadata 返回完整 JSON。

                    images: (bd.images || local.images).map((img: any) => ({
                      ...img,
                      url: img.url || `${DATASET_API_URL}/datasets/${bd.id}/images/${img.id}/file`
                    }))
                  };
                } else {
                  // 新数据集
                  return {
                    ...bd,
                    images: (bd.images || []).map((img: any) => ({
                      ...img,
                      url: img.url || `${DATASET_API_URL}/datasets/${bd.id}/images/${img.id}/file`
                    }))
                  };
                }
              });

              return { datasets: newDatasets };
            });
            console.log('[Dataset Store] 已同步数据集列表');
          }
        } catch (error) {
          console.error('[Dataset Store] 获取数据集列表失败:', error);
        }
      },

      // 获取数据集详情（包含标注）
      fetchDatasetDetails: async (datasetId: string) => {
        try {
          // 请求包含标注的数据
          const response = await fetch(`${DATASET_API_URL}/datasets/${datasetId}?include_annotations=true`);
          if (response.ok) {
            const remoteDataset = await response.json();

            // 为每张图片生成 URL（如果不存在）
            const imagesWithUrls = (remoteDataset.images || []).map((img: any) => ({
              ...img,
              // 如果已有 url 使用原有，否则从 API 生成
              url: img.url || `${DATASET_API_URL}/datasets/${datasetId}/images/${img.id}/file`
            }));

            set(state => ({
              datasets: state.datasets.map(d => {
                if (d.id === datasetId) {
                  return {
                    ...d,
                    ...remoteDataset,
                    images: imagesWithUrls
                  };
                }
                return d;
              })
            }));
            console.log(`[Dataset Store] 已同步数据集详情: ${datasetId}`);
          }
        } catch (error) {
          console.error(`[Dataset Store] 获取数据集详情失败 ${datasetId}:`, error);
        }
      }
    }),
    {
      name: 'lichain-dataset-v1',
      storage: createIndexedDBStorage(), // 移除 createJSONStorage 包装
      partialize: (state) => ({
        datasets: state.datasets,
        currentDatasetId: state.currentDatasetId
      }),
      version: 1,
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[数据集] 恢复数据失败:', error);
        } else if (state) {
          state.setHasHydrated(true);
          console.log('✅ [数据集] 数据已从本地恢复');
          console.log(`   📁 数据集: ${state.datasets?.length || 0} 个`);
          const totalImages = state.datasets?.reduce((sum, d) => sum + d.images.length, 0) || 0;
          console.log(`   🖼️ 图片: ${totalImages} 张`);
          
          // 自动从后端同步数据集列表，确保本地数据与后端一致
          console.log('🔄 [数据集] 正在从后端同步数据...');
          state.fetchDatasets().then(() => {
            console.log('✅ [数据集] 后端数据同步完成');
          }).catch((err: Error) => {
            console.warn('[数据集] 后端同步失败（服务可能未启动）:', err.message);
          });
        }
      }
    }
  )
);

