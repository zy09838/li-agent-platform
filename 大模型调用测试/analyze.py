#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI视觉质检分析工具 - 统一版本
支持单张图片测试和批量分析
"""

import requests
import json
import time
import argparse
import logging
from pathlib import Path
from datetime import datetime
import sys

# ==================== 配置部分 ====================
BASE_URL = "https://liai-app.chj.cloud/v1"
API_KEY = "app-1fPM2CPElfDesy1UNJAKTvAb"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}
SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']

# ==================== 日志配置 ====================
def setup_logger(log_file=None):
    """配置日志记录器"""
    logger = logging.getLogger('QualityChecker')
    logger.setLevel(logging.INFO)

    # 控制台输出
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_format = logging.Formatter('%(message)s')
    console_handler.setFormatter(console_format)
    logger.addHandler(console_handler)

    # 文件输出（如果指定）
    if log_file:
        file_handler = logging.FileHandler(log_file, encoding='utf-8')
        file_handler.setLevel(logging.DEBUG)
        file_format = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
        file_handler.setFormatter(file_format)
        logger.addHandler(file_handler)

    return logger

# ==================== API交互类 ====================
class QualityCheckAPI:
    """API交互封装类"""

    def __init__(self, logger=None):
        self.logger = logger or logging.getLogger('QualityChecker')

    def check_connection(self):
        """测试API连接"""
        try:
            url = f"{BASE_URL}/parameters"
            response = requests.get(url, headers=HEADERS, timeout=10)
            return response.status_code == 200
        except Exception as e:
            self.logger.error(f"连接测试失败: {e}")
            return False

    def upload_file(self, file_path, user="api_user"):
        """上传文件"""
        file_extension = Path(file_path).suffix.lower()
        mime_types = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        }
        mime_type = mime_types.get(file_extension, 'image/jpeg')

        try:
            url = f"{BASE_URL}/files/upload"
            with open(file_path, 'rb') as f:
                files = {'file': (Path(file_path).name, f, mime_type)}
                data = {'user': user}
                headers = {"Authorization": f"Bearer {API_KEY}"}

                response = requests.post(url, headers=headers, files=files, data=data, timeout=30)

                if response.status_code in [200, 201]:
                    result = response.json()
                    return {
                        'success': True,
                        'file_id': result['id'],
                        'size': result['size']
                    }
                else:
                    return {
                        'success': False,
                        'error': f"HTTP {response.status_code}: {response.text}"
                    }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def analyze_image(self, file_id, query="请对这个产品进行质检分析，识别所有可能的瑕疵。",
                     user="api_user", mode="blocking"):
        """分析图片"""
        url = f"{BASE_URL}/chat-messages"

        inputs = {
            "doc_name": {
                "transfer_method": "local_file",
                "upload_file_id": file_id,
                "type": "image"
            }
        }

        payload = {
            "query": query,
            "inputs": inputs,
            "response_mode": mode,
            "user": user,
            "conversation_id": ""
        }

        try:
            if mode == "blocking":
                response = requests.post(url, headers=HEADERS, json=payload, timeout=120)

                if response.status_code == 200:
                    result = response.json()
                    return {
                        'success': True,
                        'answer': result.get('answer', ''),
                        'metadata': result.get('metadata', {})
                    }
                else:
                    return {
                        'success': False,
                        'error': f"HTTP {response.status_code}: {response.text}"
                    }
            else:  # streaming mode
                response = requests.post(url, headers=HEADERS, json=payload, stream=True, timeout=120)

                if response.status_code == 200:
                    full_answer = ""
                    metadata = {}

                    for line in response.iter_lines():
                        if line:
                            line_text = line.decode('utf-8')
                            if line_text.startswith('data: '):
                                try:
                                    data = json.loads(line_text[6:])
                                    event = data.get('event', '')

                                    if event == 'message':
                                        full_answer += data.get('answer', '')
                                    elif event == 'message_end':
                                        metadata = data.get('metadata', {})
                                except json.JSONDecodeError:
                                    continue

                    return {
                        'success': True,
                        'answer': full_answer,
                        'metadata': metadata
                    }
                else:
                    return {
                        'success': False,
                        'error': f"HTTP {response.status_code}"
                    }
        except Exception as e:
            return {'success': False, 'error': str(e)}

# ==================== 分析器类 ====================
class ImageAnalyzer:
    """图片质检分析器"""

    def __init__(self, logger=None, log_file=None):
        self.logger = logger or setup_logger(log_file)
        self.api = QualityCheckAPI(self.logger)
        self.results = []
        self.stats = {
            'total': 0,
            'success': 0,
            'failed': 0,
            'start_time': None,
            'end_time': None
        }

    def analyze_single(self, image_path, mode="blocking"):
        """分析单张图片"""
        self.logger.info(f"\n{'='*70}")
        self.logger.info(f"分析图片: {Path(image_path).name}")
        self.logger.info(f"{'='*70}")

        # 检查连接
        if not self.api.check_connection():
            self.logger.error("❌ API连接失败")
            return None

        self.logger.info("✓ API连接正常")

        # 上传文件
        self.logger.info(f"\n上传文件...")
        upload_result = self.api.upload_file(image_path)

        if not upload_result['success']:
            self.logger.error(f"❌ 上传失败: {upload_result['error']}")
            return None

        file_id = upload_result['file_id']
        self.logger.info(f"✓ 上传成功 (ID: {file_id[:8]}...)")

        # 分析图片
        self.logger.info(f"\n开始分析 ({mode}模式)...")
        analysis_result = self.api.analyze_image(file_id, mode=mode)

        if not analysis_result['success']:
            self.logger.error(f"❌ 分析失败: {analysis_result['error']}")
            return None

        self.logger.info("✓ 分析完成\n")
        self.logger.info(f"{'='*70}")
        self.logger.info("质检分析结果:")
        self.logger.info(f"{'='*70}\n")
        self.logger.info(analysis_result['answer'])

        # Token统计
        if 'metadata' in analysis_result and 'usage' in analysis_result['metadata']:
            usage = analysis_result['metadata']['usage']
            self.logger.info(f"\n{'='*70}")
            self.logger.info("Token使用情况:")
            self.logger.info(f"  总计: {usage.get('total_tokens', 'N/A')}")
            self.logger.info(f"  输入: {usage.get('prompt_tokens', 'N/A')}")
            self.logger.info(f"  输出: {usage.get('completion_tokens', 'N/A')}")
            self.logger.info(f"{'='*70}\n")

        return analysis_result

    def analyze_batch(self, directory, output_dir=None):
        """批量分析目录中的所有图片"""
        self.logger.info("="*70)
        self.logger.info("批量图片质检分析")
        self.logger.info("="*70)

        # 创建时间戳输出目录
        if output_dir is None:
            output_dir = Path(directory).parent

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        result_dir = Path(output_dir) / f"分析结果_{timestamp}"
        result_dir.mkdir(parents=True, exist_ok=True)

        self.logger.info(f"\n结果保存目录: {result_dir}")

        # 获取所有图片文件
        image_files = []
        for ext in SUPPORTED_FORMATS:
            image_files.extend(Path(directory).glob(f"*{ext}"))

        image_files = sorted(image_files)
        self.stats['total'] = len(image_files)

        if self.stats['total'] == 0:
            self.logger.warning(f"⚠️  未找到支持的图片文件")
            return

        self.logger.info(f"\n找到 {self.stats['total']} 张图片待分析")
        self.logger.info(f"目录: {directory}")
        self.logger.info(f"支持格式: {', '.join(SUPPORTED_FORMATS)}")
        self.logger.info("-"*70)

        self.stats['start_time'] = time.time()

        # 处理每张图片
        for index, image_path in enumerate(image_files, 1):
            result = self._process_image(image_path, index, self.stats['total'])
            self.results.append(result)

            # 控制请求频率
            if index < self.stats['total']:
                time.sleep(1)

        self.stats['end_time'] = time.time()
        elapsed = self.stats['end_time'] - self.stats['start_time']

        # 输出统计
        self.logger.info("\n" + "="*70)
        self.logger.info("处理完成")
        self.logger.info("="*70)
        self.logger.info(f"总数量: {self.stats['total']}")
        self.logger.info(f"成功: {self.stats['success']} ✓")
        self.logger.info(f"失败: {self.stats['failed']} ✗")
        self.logger.info(f"总耗时: {elapsed:.2f} 秒")
        self.logger.info(f"平均耗时: {elapsed/self.stats['total']:.2f} 秒/张")
        self.logger.info("="*70)

        # 保存结果
        self._save_report(result_dir)

    def _process_image(self, image_path, index, total):
        """处理单张图片"""
        filename = Path(image_path).name
        self.logger.info(f"\n[{index}/{total}] 处理: {filename}")

        result = {
            'index': index,
            'filename': filename,
            'filepath': str(image_path),
            'timestamp': datetime.now().isoformat(),
            'success': False,
            'file_id': None,
            'analysis': None,
            'metadata': None,
            'error': None
        }

        # 上传
        self.logger.info(f"  → 上传文件: {filename}")
        upload_result = self.api.upload_file(image_path)

        if not upload_result['success']:
            result['error'] = upload_result['error']
            self.stats['failed'] += 1
            self.logger.info(f"  ✗ 上传失败: {upload_result['error']}")
            return result

        result['file_id'] = upload_result['file_id']
        self.logger.info(f"  ✓ 上传成功 (ID: {result['file_id'][:8]}...)")

        # 分析
        self.logger.info(f"  → 开始分析...")
        analysis_result = self.api.analyze_image(result['file_id'])

        if analysis_result['success']:
            result['success'] = True
            result['analysis'] = analysis_result['answer']
            result['metadata'] = analysis_result.get('metadata')
            self.stats['success'] += 1
            self.logger.info(f"  ✓ 分析完成")
        else:
            result['error'] = analysis_result['error']
            self.stats['failed'] += 1
            self.logger.info(f"  ✗ 分析失败")

        return result

    def _save_report(self, output_dir):
        """保存分析报告"""
        report_file = Path(output_dir) / "分析报告.md"
        json_file = Path(output_dir) / "原始数据.json"
        summary_file = Path(output_dir) / "执行摘要.txt"

        self.logger.info(f"\n保存报告到: {output_dir}")

        # 生成Markdown报告
        report = self._generate_report()

        try:
            # 保存Markdown报告
            with open(report_file, 'w', encoding='utf-8') as f:
                f.write(report)
            self.logger.info(f"✓ 分析报告: {report_file.name}")

            # 保存JSON数据
            json_data = {
                'summary': self.stats,
                'results': self.results
            }

            with open(json_file, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, ensure_ascii=False, indent=2)
            self.logger.info(f"✓ 原始数据: {json_file.name}")

            # 保存执行摘要
            summary = self._generate_summary()
            with open(summary_file, 'w', encoding='utf-8') as f:
                f.write(summary)
            self.logger.info(f"✓ 执行摘要: {summary_file.name}")

        except Exception as e:
            self.logger.error(f"✗ 保存失败: {e}")

    def _generate_report(self):
        """生成Markdown报告"""
        lines = []

        # 标题
        lines.append("# 批量图片质检分析报告\n")
        lines.append(f"**生成时间:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        lines.append(f"**分析工具:** AI视觉质检分析工具\n")
        lines.append(f"**API:** {BASE_URL}\n\n")
        lines.append("---\n\n")

        # 统计
        lines.append("## 📊 统计摘要\n\n")
        lines.append(f"- **总数量:** {self.stats['total']} 张\n")
        lines.append(f"- **成功:** {self.stats['success']} 张 ✓\n")
        lines.append(f"- **失败:** {self.stats['failed']} 张 ✗\n")

        if self.stats['start_time']:
            elapsed = self.stats['end_time'] - self.stats['start_time']
            lines.append(f"- **总耗时:** {elapsed:.2f} 秒\n")
            lines.append(f"- **平均耗时:** {elapsed/self.stats['total']:.2f} 秒/张\n")

        lines.append("\n---\n\n")

        # 详细结果
        lines.append("## 📋 详细分析结果\n\n")

        for result in self.results:
            lines.append(f"### {result['index']}. {result['filename']}\n\n")
            lines.append(f"- **状态:** {'✅ 成功' if result['success'] else '❌ 失败'}\n")
            lines.append(f"- **时间:** {result['timestamp']}\n")

            if result['file_id']:
                lines.append(f"- **文件ID:** `{result['file_id']}`\n")

            lines.append("\n")

            if result['success'] and result['analysis']:
                lines.append("#### 质检分析\n\n")
                lines.append(f"{result['analysis']}\n\n")

                if result['metadata'] and 'usage' in result['metadata']:
                    usage = result['metadata']['usage']
                    lines.append("#### Token使用\n\n")
                    lines.append(f"- 总计: {usage.get('total_tokens', 'N/A')}\n")
                    lines.append(f"- 输入: {usage.get('prompt_tokens', 'N/A')}\n")
                    lines.append(f"- 输出: {usage.get('completion_tokens', 'N/A')}\n\n")

            elif result['error']:
                lines.append("#### 错误信息\n\n")
                lines.append(f"```\n{result['error']}\n```\n\n")

            lines.append("---\n\n")

        return ''.join(lines)

    def _generate_summary(self):
        """生成执行摘要"""
        lines = []

        lines.append("="*70 + "\n")
        lines.append("批量分析执行摘要\n")
        lines.append("="*70 + "\n\n")

        lines.append(f"执行时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")

        lines.append(f"总数量: {self.stats['total']}\n")
        lines.append(f"成功: {self.stats['success']} ✓\n")
        lines.append(f"失败: {self.stats['failed']} ✗\n")

        if self.stats['start_time']:
            elapsed = self.stats['end_time'] - self.stats['start_time']
            lines.append(f"总耗时: {elapsed:.2f} 秒\n")
            lines.append(f"平均耗时: {elapsed/self.stats['total']:.2f} 秒/张\n")

        lines.append("\n" + "="*70 + "\n")

        return ''.join(lines)

# ==================== 命令行接口 ====================
def main():
    parser = argparse.ArgumentParser(
        description='AI视觉质检分析工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 测试单张图片
  python analyze.py --single image.jpg

  # 批量分析文件夹
  python analyze.py --batch 测试数据/

  # 指定输出目录
  python analyze.py --batch 测试数据/ --output 结果/

  # 使用流式模式
  python analyze.py --single image.jpg --mode streaming

  # 启用详细日志
  python analyze.py --batch 测试数据/ --log analysis.log
        """
    )

    parser.add_argument('--single', '-s', metavar='IMAGE',
                       help='分析单张图片')
    parser.add_argument('--batch', '-b', metavar='DIR',
                       help='批量分析目录中的所有图片')
    parser.add_argument('--output', '-o', metavar='DIR',
                       help='输出目录（默认为输入目录）')
    parser.add_argument('--mode', '-m', choices=['blocking', 'streaming'],
                       default='blocking', help='响应模式（默认: blocking）')
    parser.add_argument('--log', '-l', metavar='FILE',
                       help='保存详细日志到文件')
    parser.add_argument('--test', '-t', action='store_true',
                       help='测试API连接')

    args = parser.parse_args()

    # 如果没有参数，显示帮助
    if not any([args.single, args.batch, args.test]):
        parser.print_help()
        sys.exit(1)

    # 设置日志
    logger = setup_logger(args.log)
    analyzer = ImageAnalyzer(logger, args.log)

    # 测试连接
    if args.test:
        logger.info("测试API连接...")
        if analyzer.api.check_connection():
            logger.info("✓ API连接正常")
        else:
            logger.error("✗ API连接失败")
        return

    # 单张图片分析
    if args.single:
        if not Path(args.single).exists():
            logger.error(f"文件不存在: {args.single}")
            sys.exit(1)

        analyzer.analyze_single(args.single, mode=args.mode)

    # 批量分析
    if args.batch:
        if not Path(args.batch).is_dir():
            logger.error(f"目录不存在: {args.batch}")
            sys.exit(1)

        analyzer.analyze_batch(args.batch, output_dir=args.output)

if __name__ == "__main__":
    main()
