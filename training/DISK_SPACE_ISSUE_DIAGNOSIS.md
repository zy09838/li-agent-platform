# 听觉大师检测失败问题诊断报告

## 🔴 问题现象

用户上传音频文件后，听觉大师检测失败。

---

## 🔍 问题诊断

### 错误信息
```
检测失败: [Errno 28] No space left on device
```

### 根本原因
**磁盘空间不足** - 系统根分区已满，无法创建临时文件进行音频检测。

---

## 📊 磁盘使用情况

### 整体情况
```bash
文件系统: /dev/sda2
总容量: 879G
已用: 834G
可用: 20MB  ⚠️
使用率: 100%
```

### 空间占用分析

| 目录 | 大小 | 说明 |
|------|------|------|
| /home/dell/桌面 | 522G | 桌面目录 |
| ├─ 漆面_目标检测_1221 | 324G | 大型数据集 |
| ├─ 漆面_目标检测_1221.zip | 59G | 压缩包（可删除） |
| ├─ 漆面_目标检测_测试 | 34G | 测试数据 |
| ├─ 漆面_目标检测_1220 | 27G | 旧版数据集 |
| ├─ 智能体协作平台_0101 | 26G | 当前项目 |
| │  └─ training | 24G | 训练目录 |
| │     ├─ datasets | 6.9G | 数据集 |
| │     ├─ datasets_train_*_medium_aug | 6.2G + 5.6G | 训练副本 |
| │     ├─ datasets_train_*_nano_aug | 1.8G + 777M | 训练副本 |
| │     ├─ evaluation_results | 504M | 评估结果 |
| │     └─ runs | 315M | 训练运行记录 |

---

## 🎯 音频检测失败原因

### 工作流程
1. 用户上传音频文件
2. 服务器接收文件，保存到 `/tmp/tmpXXXXXX.wav`
3. 模型处理音频文件
4. 删除临时文件
5. 返回检测结果

### 失败点
**步骤 2** - 无法创建临时文件，因为磁盘已满。

```python
# audio_inference_server.py:89
with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp:
    audio_file.save(temp.name)  # ❌ 失败：No space left on device
```

---

## 💡 解决方案

### 🚨 紧急解决方案（立即可用）

#### 方案 1: 清理训练数据集副本（推荐）

删除旧的训练数据集副本，可释放约 **15-20GB** 空间：

```bash
# 进入 training 目录
cd /home/dell/桌面/智能体协作平台_0101/training

# 删除训练数据集副本（保留原始 datasets）
rm -rf datasets_train_20260107_182308_medium_aug  # 6.2GB
rm -rf datasets_train_20260107_115237_medium_aug  # 5.6GB
rm -rf datasets_train_20260107_123521_nano_aug    # 1.8GB
rm -rf datasets_train_20260107_114649_small_aug   # 777MB
rm -rf datasets_train_20260107_002900_nano_aug    # 777MB
rm -rf datasets_train_20260107_010648_small       # 80MB

# 删除旧的评估结果（如果不需要）
# rm -rf evaluation_results  # 504MB

# 删除旧的训练运行记录（如果不需要）
# rm -rf runs  # 315MB
```

**预计释放空间: ~15GB**

---

#### 方案 2: 清理桌面上的压缩包和旧数据

```bash
cd /home/dell/桌面

# 删除已解压的压缩包
rm -f 漆面_目标检测_1221.zip  # 59GB
rm -f 漆面_目标检测平台_1216.zip  # 4GB

# 删除旧版本的数据集（如果不需要）
# rm -rf 漆面_目标检测_1220  # 27GB
# rm -rf 漆面_目标检测_1205  # 13GB
```

**预计释放空间: 63GB+**

---

#### 方案 3: 移动大文件到外部存储

如果有外部硬盘或其他分区，可以移动大数据集：

```bash
# 检查是否有其他分区
df -h

# 移动大文件（示例）
# mv /home/dell/桌面/漆面_目标检测_1221 /mnt/external_drive/
```

---

### 🔧 快速清理脚本

创建清理脚本 `/home/dell/桌面/智能体协作平台_0101/training/cleanup_old_datasets.sh`:

```bash
#!/bin/bash

echo "🧹 开始清理旧的训练数据集..."
echo ""

cd /home/dell/桌面/智能体协作平台_0101/training

# 列出将要删除的目录
echo "将删除以下目录:"
ls -lh | grep datasets_train_

echo ""
read -p "确认删除? (y/N) " confirm

if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    echo "正在删除..."

    rm -rf datasets_train_20260107_182308_medium_aug
    rm -rf datasets_train_20260107_115237_medium_aug
    rm -rf datasets_train_20260107_123521_nano_aug
    rm -rf datasets_train_20260107_114649_small_aug
    rm -rf datasets_train_20260107_002900_nano_aug
    rm -rf datasets_train_20260107_010648_small

    echo ""
    echo "✅ 清理完成！"
    echo ""
    echo "磁盘空间情况:"
    df -h /
else
    echo "已取消"
fi
```

使用方法：
```bash
chmod +x /home/dell/桌面/智能体协作平台_0101/training/cleanup_old_datasets.sh
/home/dell/桌面/智能体协作平台_0101/training/cleanup_old_datasets.sh
```

---

### 📝 长期解决方案

#### 1. 自动清理训练副本

修改训练脚本，训练完成后自动删除临时数据集副本。

#### 2. 使用外部存储

将大型数据集存储在外部硬盘或NAS上。

#### 3. 定期清理

设置定时任务，定期清理：
- 旧的训练副本
- 过期的评估结果
- 日志文件

#### 4. 监控磁盘空间

添加磁盘空间监控，低于 10% 时发出警告。

---

## ✅ 验证修复

清理空间后，验证音频检测功能：

```bash
# 1. 检查磁盘空间
df -h /

# 2. 测试音频检测 API
curl -X POST http://localhost:5001/api/audio/detect \
  -F "audio=@/home/dell/桌面/智能体协作平台_0101/听觉测试模型/风扇.wav"

# 3. 应该返回检测结果（而不是磁盘空间错误）
```

---

## 🎯 推荐执行步骤

### 步骤 1: 立即清理（推荐）

```bash
# 删除训练数据集副本
cd /home/dell/桌面/智能体协作平台_0101/training
rm -rf datasets_train_*

# 删除已解压的压缩包
cd /home/dell/桌面
rm -f *.zip
```

**预计释放: ~75GB**

### 步骤 2: 验证

```bash
# 检查空间
df -h /

# 测试音频检测
curl -X POST http://localhost:5001/api/audio/detect \
  -F "audio=@/home/dell/桌面/智能体协作平台_0101/听觉测试模型/风扇.wav"
```

### 步骤 3: 在前端测试

打开听觉大师页面，上传音频文件，验证检测功能正常。

---

## 📚 相关文件

- 音频推理服务: `/home/dell/桌面/智能体协作平台_0101/training/audio_inference_server.py`
- 训练服务: `/home/dell/桌面/智能体协作平台_0101/training/train_server.py`
- 临时文件目录: `/tmp`

---

**诊断时间**: 2026-01-12
**问题级别**: 🔴 紧急（磁盘已满，服务无法正常运行）
**影响范围**:
- ❌ 听觉大师音频检测
- ❌ 视觉大师图片检测（可能）
- ❌ 模型训练（可能）
- ❌ 任何需要创建临时文件的功能

**建议**: **立即清理磁盘空间**，释放至少 20GB 以确保系统正常运行。
