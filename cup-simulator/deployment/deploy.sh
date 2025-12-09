#!/bin/bash

# 部署脚本 - 将 Device Simulator Next.js 项目源代码部署到云端服务器
# 使用方法: ./deploy.sh
# 
# 部署流程：
# 1. 检查本地项目结构
# 2. 上传源代码到服务器（不包括构建产物和 node_modules）
# 3. 依赖安装和构建步骤由系统管理员在服务器上手动完成
# 
# 注意：Nginx 配置、Node.js 环境、依赖安装和构建由系统管理员手动完成

set -e  # 遇到错误立即退出

# 获取脚本所在目录的绝对路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 脚本在 cup-simulator/deployment/ 目录下，上一级就是 cup-simulator 目录
LOCAL_PATH="$(dirname "$SCRIPT_DIR")"

# ==================== 配置区域 ====================
SERVER_IP="8.136.36.194"
SERVER_USER="root"
SERVER_PASSWORD="Feelnova#2020515"
REMOTE_PATH="/var/www/device-simulator/cup-simulator"

# 注意：Nginx配置和Node.js环境需要系统管理员手动完成

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ==================== 辅助函数 ====================
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 检查本地文件是否存在
check_local_files() {
    print_info "检查本地文件..."
    
    # 显示实际使用的路径（用于调试）
    print_info "使用本地路径: $LOCAL_PATH"
    
    if [ ! -d "$LOCAL_PATH" ]; then
        print_error "本地目录不存在: $LOCAL_PATH"
        print_error "当前工作目录: $(pwd)"
        print_error "脚本目录: $SCRIPT_DIR"
        exit 1
    fi
    
    # 检查 Next.js 项目关键文件
    if [ ! -f "$LOCAL_PATH/package.json" ]; then
        print_error "找不到 package.json: $LOCAL_PATH/package.json"
        print_error "请确认这是正确的 Next.js 项目目录"
        exit 1
    fi
    
    if [ ! -f "$LOCAL_PATH/next.config.js" ]; then
        print_error "找不到 next.config.js: $LOCAL_PATH/next.config.js"
        print_error "请确认这是正确的 Next.js 项目目录"
        exit 1
    fi
    
    print_success "本地文件检查通过"
}

# 检查本地项目完整性（不构建）
check_project_structure() {
    print_info "检查项目结构..."
    
    cd "$LOCAL_PATH"
    
    # 检查关键目录和文件是否存在
    local required_dirs=("src")
    local required_files=("package.json" "next.config.js")
    
    for dir in "${required_dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            print_error "缺少必要目录: $dir"
            exit 1
        fi
    done
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            print_error "缺少必要文件: $file"
            exit 1
        fi
    done
    
    print_success "项目结构检查通过"
    print_info "注意：项目将在服务器端构建，不进行本地构建"
}

# 安装必要的工具
install_sshpass() {
    if ! command -v sshpass &> /dev/null; then
        print_info "安装 sshpass..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            if command -v brew &> /dev/null; then
                brew install hudochenkov/sshpass/sshpass
            else
                print_error "请先安装 Homebrew，然后运行: brew install hudochenkov/sshpass/sshpass"
                exit 1
            fi
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            # Linux
            sudo apt-get update && sudo apt-get install -y sshpass
        else
            print_error "不支持的操作系统，请手动安装 sshpass"
            exit 1
        fi
    fi
}

# 检查SSH连接
check_ssh_connection() {
    print_info "检查SSH连接..."
    
    if sshpass -p "$SERVER_PASSWORD" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 \
        $SERVER_USER@$SERVER_IP "echo 'Connection successful'" > /dev/null 2>&1; then
        print_success "SSH连接成功"
        return 0
    else
        print_error "无法连接到服务器，请检查："
        print_error "  1. 服务器IP地址是否正确: $SERVER_IP"
        print_error "  2. 网络连接是否正常"
        print_error "  3. 服务器是否允许SSH连接"
        exit 1
    fi
}

# 在服务器上执行命令（带密码）
ssh_exec() {
    sshpass -p "$SERVER_PASSWORD" ssh -o StrictHostKeyChecking=no \
        $SERVER_USER@$SERVER_IP "$1"
}

# 在服务器上准备目录结构
prepare_server_directories() {
    print_info "准备服务器目录结构..."
    
    ssh_exec "
        # 创建目标目录（如果不存在）
        mkdir -p $REMOTE_PATH
        
        # 创建备份目录（用于备份旧版本）
        mkdir -p $REMOTE_PATH.backup
        
        # 如果目标目录已存在且有内容，先备份
        if [ -d \"$REMOTE_PATH\" ] && [ \"\$(ls -A $REMOTE_PATH 2>/dev/null)\" ]; then
            echo '发现现有文件，创建备份...'
            BACKUP_NAME=\"device-simulator_backup_\$(date +%Y%m%d_%H%M%S)\"
            cp -r $REMOTE_PATH $REMOTE_PATH.backup/\$BACKUP_NAME
            echo \"备份完成: $REMOTE_PATH.backup/\$BACKUP_NAME\"
        fi
        
        # 设置权限
        chmod -R 755 $REMOTE_PATH
        
        echo '目录结构准备完成'
    "
    
    print_success "服务器目录准备完成"
}

# 上传文件到服务器
upload_files() {
    print_info "上传文件到服务器..."
    
    # 先清空目标目录（保留备份）
    print_info "清空目标目录（备份已保存）..."
    ssh_exec "rm -rf $REMOTE_PATH/* $REMOTE_PATH/.[!.]* 2>/dev/null || true"
    
    # 上传文件
    print_info "正在上传文件（这可能需要几分钟，取决于文件大小）..."
    
    # 使用 rsync 上传 Next.js 项目源代码（不包括构建产物）
    # 包含：源代码、配置文件
    # 排除：构建产物、依赖、缓存等
    # 使用 --no-owner 和 --no-group 避免保留本地文件的所有者信息
    sshpass -p "$SERVER_PASSWORD" rsync -avz --progress \
        --no-owner \
        --no-group \
        --exclude='.git' \
        --exclude='*.log' \
        --exclude='.DS_Store' \
        --exclude='node_modules' \
        --exclude='.next' \
        --exclude='*.md' \
        --exclude='deployment' \
        "$LOCAL_PATH/" \
        $SERVER_USER@$SERVER_IP:"$REMOTE_PATH/"
    
    print_success "文件上传完成"
}


# 设置文件权限
set_permissions() {
    print_info "设置文件权限和所有者..."
    
    ssh_exec "
        # 将所有文件和目录的所有者改为 root:root
        chown -R root:root $REMOTE_PATH
        
        # 设置目录权限
        find $REMOTE_PATH -type d -exec chmod 755 {} \;
        
        # 设置文件权限
        find $REMOTE_PATH -type f -exec chmod 644 {} \;
        
        # 确保脚本文件有执行权限
        find $REMOTE_PATH -type f -name '*.sh' -exec chmod 755 {} \;
        
        echo '权限和所有者设置完成'
    "
    
    print_success "文件权限和所有者设置完成"
}

# 显示部署信息
show_deployment_info() {
    print_success "=========================================="
    print_success "部署完成！"
    print_success "=========================================="
    echo ""
    print_info "服务器信息:"
    echo "  - 服务器IP: $SERVER_IP"
    echo "  - 部署路径: $REMOTE_PATH"
    echo ""
    print_info "文件位置:"
    echo "  - Next.js 项目: $REMOTE_PATH/"
    echo "  - 备份目录: $REMOTE_PATH.backup/"
    echo ""
    print_warning "后续步骤（需要系统管理员手动完成）:"
    echo "  1. 登录服务器并安装依赖:"
    echo "     ssh $SERVER_USER@$SERVER_IP"
    echo "     cd $REMOTE_PATH"
    echo "     npm ci"
    echo ""
    echo "  2. 在服务器上构建项目:"
    echo "     npm run build"
    echo ""
    echo "  3. 配置进程管理器 (PM2 或 systemd) 运行:"
    echo "     npm start"
    echo ""
    echo "  4. 配置 Nginx 反向代理到: http://localhost:3000"
    echo ""
    echo "  5. 配置域名和 SSL 证书（如需要 HTTPS）"
    echo ""
    echo "  6. 测试访问网站"
    echo ""
    print_info "文件上传完成，请通知系统管理员配置运行环境"
    echo ""
}

# ==================== 主部署流程 ====================
main() {
    echo ""
    print_info "=========================================="
    print_info "开始部署 Device Simulator Next.js 项目"
    print_info "=========================================="
    echo ""
    
    # 1. 检查本地文件
    check_local_files
    
    # 2. 检查项目结构（不构建）
    check_project_structure
    
    # 3. 安装必要工具
    install_sshpass
    
    # 4. 检查SSH连接
    check_ssh_connection
    
    # 5. 准备服务器目录
    prepare_server_directories
    
    # 6. 上传源代码文件
    upload_files
    
    # 7. 设置权限
    set_permissions
    
    # 8. 显示部署信息
    show_deployment_info
    
    print_success "所有步骤完成！"
}

# 运行主函数
main

