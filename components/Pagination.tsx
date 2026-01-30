import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  pageSize,
  total,
  onPageChange
}) => {
  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages: number[] = [];
    const maxVisible = 7; // 最多显示7个页码

    if (totalPages <= maxVisible) {
      // 如果总页数少于最大显示数，显示所有页码
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 否则智能显示页码
      if (currentPage <= 4) {
        // 当前页在前面
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push(-1); // 省略号
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        // 当前页在后面
        pages.push(1);
        pages.push(-1); // 省略号
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        // 当前页在中间
        pages.push(1);
        pages.push(-1); // 省略号
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push(-1); // 省略号
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, total);

  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
      {/* 显示信息 */}
      <div className="text-sm text-gray-600">
        显示 <span className="font-medium">{startItem}</span> - <span className="font-medium">{endItem}</span> 条，
        共 <span className="font-medium">{total}</span> 条
      </div>

      {/* 分页控件 */}
      <div className="flex items-center gap-2">
        {/* 上一页 */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
        >
          <ChevronLeft size={16} />
          上一页
        </button>

        {/* 页码 */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, index) => {
            if (page === -1) {
              return (
                <span key={`ellipsis-${index}`} className="px-3 py-2 text-gray-500">
                  ...
                </span>
              );
            }

            return (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`min-w-[40px] h-10 px-3 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === page
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            );
          })}
        </div>

        {/* 下一页 */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
        >
          下一页
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};
