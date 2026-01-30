# 🔴 听觉大师检测失败 - 快速修复指南

## 问题原因

**磁盘空间已满**（100% 使用，仅剩 20MB）

```
错误信息: [Errno 28] No space left on device
```

---

## 🚨 立即执行（必须）

### 方法 1: 使用清理脚本（推荐）

```bash
cd /home/dell/桌面/智能体协作平台_0101/training
./cleanup_old_datasets.sh
```

脚本会：
- ✅ 显示所有训练数据集副本
- ✅ 显示占用空间
- ✅ 询问确认后删除
- ✅ 显示清理结果
- ✅ **不会删除原始数据集**

**预计释放: 15-20GB**

---

### 方法 2: 手动删除

```bash
cd /home/dell/桌面/智能体协作平台_0101/training

# 删除训练副本（保留 datasets 和 dataset_raw）
rm -rf datasets_train_20260107_182308_medium_aug  # 6.2GB
rm -rf datasets_train_20260107_115237_medium_aug  # 5.6GB
rm -rf datasets_train_20260107_123521_nano_aug    # 1.8GB
rm -rf datasets_train_20260107_114649_small_aug   # 777MB
rm -rf datasets_train_20260107_002900_nano_aug    # 777MB
rm -rf datasets_train_20260107_010648_small       # 80MB
```

---

### 方法 3: 删除桌面压缩包（可选，更多空间）

```bash
cd /home/dell/桌面

# 删除已解压的压缩包
rm -f 漆面_目标检测_1221.zip  # 59GB
rm -f 漆面_目标检测平台_1216.zip  # 4GB
```

**预计释放: 63GB+**

---

## ✅ 验证修复

### 1. 检查磁盘空间

```bash
df -h /
```

应该看到可用空间 > 10GB

### 2. 测试音频检测 API

```bash
curl -X POST http://localhost:5001/api/audio/detect \
  -F "audio=@/home/dell/桌面/智能体协作平台_0101/听觉测试模型/风扇.wav"
```

应该返回检测结果（不再报错）

### 3. 前端测试

1. 打开听觉大师页面
2. 上传 .wav 音频文件
3. 验证检测成功

---

## 📊 空间占用情况

| 位置 | 大小 | 可删除 |
|------|------|--------|
| 训练副本 (datasets_train_*) | ~15GB | ✅ 是 |
| 桌面压缩包 (*.zip) | ~63GB | ✅ 是 |
| 原始数据集 (datasets) | 6.9GB | ❌ 否 |
| 模型文件 | ~150MB | ❌ 否 |

---

## ⚠️ 重要说明

1. **训练副本** - 训练过程中创建的临时副本，可安全删除
2. **原始数据集** - `datasets` 和 `dataset_raw` 保留，不会删除
3. **已部署模型** - 不受影响，继续正常工作
4. **历史记录** - 不受影响

---

## 🎯 推荐操作

```bash
# 一键清理（最简单）
cd /home/dell/桌面/智能体协作平台_0101/training
./cleanup_old_datasets.sh

# 输入 y 确认
# 等待清理完成
# 完成！
```

---

**问题级别**: 🔴 紧急
**影响范围**: 听觉大师、视觉大师、模型训练
**修复时间**: < 1 分钟
**是否安全**: ✅ 完全安全，不影响原始数据和已部署模型

---

**详细诊断报告**: `DISK_SPACE_ISSUE_DIAGNOSIS.md`
