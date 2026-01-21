const socket = io();

// Fake题目列表（新任务范围中暂无fake任务）
const FAKE_TASKS = [];

// 管理员用户
const ADMIN_USER = '周玉';
// 可以分配任务的用户
const ASSIGN_USER = '陈锦熠';

let currentUser = '';
let taskData = {};
let users = {};
let assignableUsers = [];

const userSelect = document.getElementById('userSelect');
const taskBoard = document.getElementById('taskBoard');
const resetBtn = document.getElementById('resetBtn');
const statsDiv = document.getElementById('stats');
const taskSearch = document.getElementById('taskSearch');
const searchBtn = document.getElementById('searchBtn');

// 初始化
socket.on('init', (data) => {
    taskData = data.taskData;
    users = data.users;
    assignableUsers = data.assignableUsers || [];
    console.log('接收到的用户列表:', Object.keys(users));
    console.log('可分配用户列表:', assignableUsers);
    renderBoard();
    updateStats();
});

// 任务更新
socket.on('taskUpdate', (data) => {
    const wasCompleted = taskData[data.taskId]?.completed || false;
    const isNowCompleted = data.task.completed;
    
    taskData[data.taskId] = data.task;
    updateTaskCell(data.taskId);
    updateStats();
    
    // 如果是新完成的任务（不是取消），触发彩蛋
    if (!wasCompleted && isNowCompleted) {
        triggerConfettiEffect(data.taskId, data.task.completedBy);
    }
});

// 重置
socket.on('reset', (data) => {
    taskData = data;
    renderBoard();
    updateStats();
});

// 错误处理
socket.on('error', (data) => {
    alert(data.message);
});

// 用户选择
userSelect.addEventListener('change', (e) => {
    currentUser = e.target.value;
    renderBoard();
});

// 重置按钮
resetBtn.addEventListener('click', () => {
    if (confirm('确定要重置所有任务吗？')) {
        socket.emit('resetAll');
    }
});

// 搜索功能
function searchTask(taskId) {
    // 验证任务ID范围
    const numId = parseInt(taskId);
    if (isNaN(numId) || numId < 323 || numId > 622) {
        alert('请输入有效的任务编号（323-622）');
        return;
    }
    
    // 移除之前的高亮
    const previousHighlight = document.querySelector('.task-cell.search-highlight');
    if (previousHighlight) {
        previousHighlight.classList.remove('search-highlight');
    }
    
    // 查找目标任务格子
    const targetCell = document.querySelector(`[data-task-id="${numId}"]`);
    if (!targetCell) {
        alert('未找到该任务编号');
        return;
    }
    
    // 滚动到目标位置
    targetCell.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center',
        inline: 'center'
    });
    
    // 添加高亮闪烁效果
    targetCell.classList.add('search-highlight');
    
    // 3秒后移除高亮（动画会重复3次，每次1秒）
    setTimeout(() => {
        targetCell.classList.remove('search-highlight');
    }, 3000);
}

// 搜索按钮点击事件
searchBtn.addEventListener('click', () => {
    const taskId = taskSearch.value.trim();
    if (taskId) {
        searchTask(taskId);
    }
});

// 搜索框回车事件
taskSearch.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const taskId = taskSearch.value.trim();
        if (taskId) {
            searchTask(taskId);
        }
    }
});

// 渲染任务板
function renderBoard() {
    taskBoard.innerHTML = '';
    
    for (let i = 323; i <= 622; i++) {
        const cell = createTaskCell(i);
        taskBoard.appendChild(cell);
    }
}

// 创建任务格子
function createTaskCell(taskId) {
    const cell = document.createElement('div');
    cell.className = 'task-cell';
    cell.dataset.taskId = taskId;
    
    // 添加区域样式
    const zone = getZone(taskId);
    cell.classList.add(`zone-${zone}`);
    
    const task = taskData[taskId];
    
    // 如果被标记为可领取，且未完成，添加特殊样式
    if (task.marked && !task.completed) {
        cell.classList.add('marked-available');
    }
    
    // 如果已分配给用户，添加分配样式（类似可领取）
    if (task && task.assignedTo && !task.completed) {
        const assignedUser = users[task.assignedTo];
        if (assignedUser) {
            cell.style.background = hexToRgba(assignedUser.color, 0.2);
            cell.classList.add('assigned-available');
            
            // 显示"待完成"标签（类似可领取标签）
            const assignedLabel = document.createElement('div');
            assignedLabel.className = 'assigned-label';
            assignedLabel.textContent = '待完成';
            cell.appendChild(assignedLabel);
        }
    }
    
    // 任务编号
    const numberSpan = document.createElement('div');
    numberSpan.className = 'task-number';
    numberSpan.textContent = taskId;
    cell.appendChild(numberSpan);
    
    // 质量标记图标（左上角，优先显示）
    if (task && task.qualityFlags) {
        const qualityIcons = [];
        if (task.qualityFlags.suspicious) {
            qualityIcons.push('⚠️');
        }
        if (task.qualityFlags.highDuplicate) {
            qualityIcons.push('📋');
        }
        if (task.qualityFlags.fake) {
            qualityIcons.push('❌');
        }
        
        if (qualityIcons.length > 0) {
            const qualityLabel = document.createElement('div');
            qualityLabel.className = 'quality-label';
            qualityLabel.textContent = qualityIcons.join(' ');
            cell.appendChild(qualityLabel);
        }
    }
    
    // 如果被标记且未完成，显示"可领取"标签（在质量标记下方）
    if (task && task.marked && !task.completed) {
        const markedLabel = document.createElement('div');
        markedLabel.className = 'marked-label';
        markedLabel.textContent = '可领取';
        cell.appendChild(markedLabel);
    }
    
    // 如果是fake题目，添加标记（右上角）
    if (FAKE_TASKS.includes(parseInt(taskId))) {
        const fakeLabel = document.createElement('div');
        fakeLabel.className = 'fake-label';
        fakeLabel.textContent = 'FAKE';
        cell.appendChild(fakeLabel);
        cell.classList.add('fake-task');
    }
    
    // 老师状态图标（右上角，优先于FAKE标签）
    if (task && task.teacherStatus) {
        if (task.teacherStatus === 'waiting_teacher') {
            const teacherLabel = document.createElement('div');
            teacherLabel.className = 'teacher-label waiting';
            teacherLabel.textContent = '🔧';
            cell.appendChild(teacherLabel);
            cell.classList.add('teacher-waiting');
        } else if (task.teacherStatus === 'teacher_done') {
            const teacherLabel = document.createElement('div');
            teacherLabel.className = 'teacher-label done';
            teacherLabel.textContent = '✏️';
            cell.appendChild(teacherLabel);
            cell.classList.add('teacher-done');
        }
    }
    
    // 如果已完成，显示完成者
    if (task && task.completed) {
        const ownerSpan = document.createElement('div');
        ownerSpan.className = 'task-owner';
        ownerSpan.textContent = task.completedBy;
        cell.appendChild(ownerSpan);
        
        // 设置完成者的颜色
        const userColor = users[task.completedBy]?.color || '#999';
        cell.style.background = userColor;
        cell.classList.add('completed');
    } else if (task && task.assignedTo && !task.completed) {
        // 如果已分配但未完成，在下面显示分配的用户名字（类似已完成任务的显示）
        const assignedOwnerSpan = document.createElement('div');
        assignedOwnerSpan.className = 'task-owner';
        assignedOwnerSpan.textContent = task.assignedTo;
        cell.appendChild(assignedOwnerSpan);
    }
    
    // 检查当前用户是否可以点击
    if (!currentUser) {
        cell.classList.add('disabled');
    } else {
        // 添加右键点击事件处理（用于标记）
        cell.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            handleMarkClick(taskId, e);
        });
        
        // 普通左键点击处理
        if (!canUserToggleTask(taskId, currentUser)) {
            cell.classList.add('disabled');
        } else {
            cell.addEventListener('click', () => handleTaskClick(taskId));
        }
    }
    
    return cell;
}

// 更新单个任务格子
function updateTaskCell(taskId) {
    const cell = document.querySelector(`[data-task-id="${taskId}"]`);
    if (cell) {
        const newCell = createTaskCell(taskId);
        cell.replaceWith(newCell);
    }
}

// 获取格子所属区域（所有任务都是共享区域）
function getZone(taskId) {
    return 'shared';
}

// 检查用户是否可以操作某个任务
function canUserToggleTask(taskId, userName) {
    if (!userName) return false;
    
    const user = users[userName];
    if (!user) {
        console.warn('用户不存在:', userName, '可用用户:', Object.keys(users));
        return false;
    }

    const task = taskData[taskId];
    if (!task) return false;
    
    // 如果格子未被占用，任何人都可以点击
    if (!task.completed) {
        return true;
    }
    
    // 如果格子已被占用，只有完成者本人可以点击（用于取消）
    if (task.completed && task.completedBy === userName) {
        return true;
    }
    
    // 其他情况不允许点击
    return false;
}

// 处理任务点击
function handleTaskClick(taskId) {
    if (!currentUser) {
        alert('请先选择你的身份');
        return;
    }
    
    socket.emit('toggleTask', { taskId, userName: currentUser });
}

// 新增：处理标记点击（右键）
function handleMarkClick(taskId, e) {
    if (!currentUser) {
        alert('请先选择你的身份');
        return;
    }
    
    // 只有管理员或陈锦熠可以使用右键菜单
    if (currentUser !== ADMIN_USER && currentUser !== ASSIGN_USER) {
        alert('只有管理员或陈锦熠可以使用右键菜单功能');
        return;
    }
    
    // 显示右键菜单
    showContextMenu(taskId, e);
}

// 显示右键菜单
function showContextMenu(taskId, e) {
    // 移除已存在的菜单和子菜单
    const existingMenu = document.getElementById('context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }
    const existingSubmenu = document.getElementById('assign-submenu');
    if (existingSubmenu) {
        existingSubmenu.remove();
    }
    
    const task = taskData[taskId];
    if (!task) return;
    
    // 创建菜单
    const menu = document.createElement('div');
    menu.id = 'context-menu';
    menu.className = 'context-menu';
    
    // 菜单项
    const menuItems = [];
    
    // 如果是陈锦熠，添加分配任务选项
    if (currentUser === ASSIGN_USER) {
        menuItems.push({
            label: '📌 分配任务',
            action: 'assignTask',
            hasSubmenu: true
        });
        menuItems.push({ label: '---', action: 'separator' });
    }
    
    menuItems.push(
        {
            label: '📋 可领取标记',
            action: 'toggleMark',
            active: task.marked
        },
        {
            label: '⚠️ 正确性存疑',
            action: 'toggleSuspicious',
            active: task.qualityFlags?.suspicious
        },
        {
            label: '📋 高重复度',
            action: 'toggleHighDuplicate',
            active: task.qualityFlags?.highDuplicate
        },
        {
            label: '🔧 等待老师修改',
            action: 'setWaitingTeacher',
            active: task.teacherStatus === 'waiting_teacher'
        },
        {
            label: '✏️ 老师已修改',
            action: 'setTeacherDone',
            active: task.teacherStatus === 'teacher_done'
        },
        {
            label: '✓ 清除老师状态',
            action: 'clearTeacherStatus',
            active: task.teacherStatus === 'not_modified'
        }
    );
    
    menuItems.forEach(item => {
        if (item.action === 'separator') {
            const separator = document.createElement('div');
            separator.className = 'context-menu-separator';
            menu.appendChild(separator);
            return;
        }
        
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        if (item.active) {
            menuItem.classList.add('active');
        }
        menuItem.textContent = item.label;
        
        if (item.hasSubmenu) {
            menuItem.classList.add('has-submenu');
            menuItem.addEventListener('mouseenter', () => {
                showAssignSubmenu(menuItem, taskId, task, e);
            });
        } else {
            menuItem.addEventListener('click', () => {
                handleMenuAction(taskId, item.action);
                menu.remove();
            });
        }
        
        menu.appendChild(menuItem);
    });
    
    // 设置菜单位置（使用clientX/clientY，因为菜单是fixed定位）
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    
    document.body.appendChild(menu);
    
    // 点击其他地方关闭菜单
    const closeMenu = (event) => {
        if (!menu.contains(event.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
            window.removeEventListener('scroll', closeMenuOnScroll, true);
        }
    };
    
    // 滚动时关闭菜单
    const closeMenuOnScroll = () => {
        menu.remove();
        document.removeEventListener('click', closeMenu);
        window.removeEventListener('scroll', closeMenuOnScroll, true);
    };
    
    // 监听滚动事件
    window.addEventListener('scroll', closeMenuOnScroll, true);
    
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
    }, 0);
}

// 处理菜单操作
function handleMenuAction(taskId, action) {
    const task = taskData[taskId];
    if (!task) return;
    
    switch (action) {
        case 'toggleMark':
            socket.emit('markTask', { taskId, userName: currentUser });
            break;
        case 'toggleSuspicious':
            socket.emit('updateQualityFlag', { 
                taskId, 
                userName: currentUser,
                flag: 'suspicious',
                value: !task.qualityFlags?.suspicious
            });
            break;
        case 'toggleHighDuplicate':
            socket.emit('updateQualityFlag', { 
                taskId, 
                userName: currentUser,
                flag: 'highDuplicate',
                value: !task.qualityFlags?.highDuplicate
            });
            break;
        case 'setWaitingTeacher':
            socket.emit('updateTeacherStatus', { 
                taskId, 
                userName: currentUser,
                status: task.teacherStatus === 'waiting_teacher' ? 'not_modified' : 'waiting_teacher'
            });
            break;
        case 'setTeacherDone':
            socket.emit('updateTeacherStatus', { 
                taskId, 
                userName: currentUser,
                status: task.teacherStatus === 'teacher_done' ? 'not_modified' : 'teacher_done'
            });
            break;
        case 'clearTeacherStatus':
            socket.emit('updateTeacherStatus', { 
                taskId, 
                userName: currentUser,
                status: 'not_modified'
            });
            break;
        case 'assignTask':
            // 这个由子菜单处理
            break;
    }
}

// 显示分配任务的子菜单
function showAssignSubmenu(parentItem, taskId, task, originalEvent) {
    // 移除已存在的子菜单
    const existingSubmenu = document.getElementById('assign-submenu');
    if (existingSubmenu) {
        existingSubmenu.remove();
    }
    
    const submenu = document.createElement('div');
    submenu.id = 'assign-submenu';
    submenu.className = 'context-menu-submenu';
    
    // 添加"取消分配"选项
    const cancelItem = document.createElement('div');
    cancelItem.className = 'context-menu-item';
    if (!task.assignedTo) {
        cancelItem.classList.add('active');
    }
    cancelItem.textContent = '取消分配';
    cancelItem.addEventListener('click', () => {
        socket.emit('assignTask', { taskId, userName: currentUser, assignTo: null });
        document.getElementById('context-menu')?.remove();
        submenu.remove();
    });
    submenu.appendChild(cancelItem);
    
    // 添加分隔线
    const separator = document.createElement('div');
    separator.className = 'context-menu-separator';
    submenu.appendChild(separator);
    
    // 添加可分配的用户选项
    assignableUsers.forEach(userName => {
        const userItem = document.createElement('div');
        userItem.className = 'context-menu-item';
        if (task.assignedTo === userName) {
            userItem.classList.add('active');
        }
        
        // 显示用户颜色和名字
        const colorBox = document.createElement('span');
        colorBox.className = 'submenu-color-box';
        colorBox.style.background = users[userName]?.color || '#999';
        userItem.appendChild(colorBox);
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = userName;
        userItem.appendChild(nameSpan);
        
        userItem.addEventListener('click', () => {
            socket.emit('assignTask', { taskId, userName: currentUser, assignTo: userName });
            document.getElementById('context-menu')?.remove();
            submenu.remove();
        });
        submenu.appendChild(userItem);
    });
    
    // 设置子菜单位置（智能判定：如果会超出白色背景区域，显示在左边）
    document.body.appendChild(submenu);
    
    // 先临时添加到DOM以获取尺寸
    submenu.style.visibility = 'hidden';
    submenu.style.display = 'block';
    
    const submenuWidth = submenu.offsetWidth;
    const submenuHeight = submenu.offsetHeight;
    const parentRect = parentItem.getBoundingClientRect();
    const mainMenu = document.getElementById('context-menu');
    const mainMenuRect = mainMenu ? mainMenu.getBoundingClientRect() : null;
    
    // 获取白色背景容器（.container）的边界
    const container = document.querySelector('.container');
    const containerRect = container ? container.getBoundingClientRect() : {
        left: 0,
        right: window.innerWidth,
        top: 0,
        bottom: window.innerHeight
    };
    
    // 计算子菜单显示在右边的位置
    const rightSideLeft = (mainMenuRect ? mainMenuRect.right : parentRect.right) + 5;
    const rightSideRight = rightSideLeft + submenuWidth;
    
    // 计算子菜单显示在左边的位置
    const leftSideRight = (mainMenuRect ? mainMenuRect.left : parentRect.left) - 5;
    const leftSideLeft = leftSideRight - submenuWidth;
    
    // 智能判定：如果右边会超出容器，就显示在左边
    let submenuLeft, submenuTop;
    
    if (rightSideRight > containerRect.right) {
        // 显示在左边
        submenuLeft = leftSideLeft;
    } else {
        // 显示在右边
        submenuLeft = rightSideLeft;
    }
    
    // 确保子菜单不会超出容器上下边界
    submenuTop = parentRect.top;
    if (submenuTop + submenuHeight > containerRect.bottom) {
        submenuTop = containerRect.bottom - submenuHeight - 10;
    }
    if (submenuTop < containerRect.top) {
        submenuTop = containerRect.top + 10;
    }
    
    submenu.style.left = submenuLeft + 'px';
    submenu.style.top = submenuTop + 'px';
    submenu.style.visibility = 'visible';
    
    // 点击其他地方关闭子菜单
    const closeSubmenu = (event) => {
        if (!submenu.contains(event.target) && !parentItem.contains(event.target)) {
            submenu.remove();
            document.removeEventListener('click', closeSubmenu);
            window.removeEventListener('scroll', closeSubmenuOnScroll, true);
        }
    };
    
    // 滚动时关闭子菜单
    const closeSubmenuOnScroll = () => {
        submenu.remove();
        document.removeEventListener('click', closeSubmenu);
        window.removeEventListener('scroll', closeSubmenuOnScroll, true);
    };
    
    // 监听滚动事件
    window.addEventListener('scroll', closeSubmenuOnScroll, true);
    
    setTimeout(() => {
        document.addEventListener('click', closeSubmenu);
    }, 0);
}

// 将十六进制颜色转换为rgba
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// 更新统计信息
function updateStats() {
    // 按完成者统计
    const stats = {
        '左宇翔': 0,
        '周玉': 0,
        '彭逸': 0,
        '葛新麟': 0,
        '陈锦熠': 0,
        '黑典': 0,
        '丁梦军': 0,
        '贺文择': 0,
        '蔡杰超': 0
    };
    
    // 按分配者统计（需完成数量）
    const assignedStats = {
        '左宇翔': 0,
        '彭逸': 0,
        '黑典': 0
    };
    
    // 状态统计
    let totalCompleted = 0;
    
    // 遍历所有任务
    for (let i = 323; i <= 622; i++) {
        const task = taskData[i];
        if (!task) continue;
        
        // 完成者统计
        if (task.completed && task.completedBy) {
            if (stats.hasOwnProperty(task.completedBy)) {
                stats[task.completedBy]++;
            }
            totalCompleted++;
        }
        
        // 分配统计（只统计未完成的任务）
        if (task.assignedTo && !task.completed && assignedStats.hasOwnProperty(task.assignedTo)) {
            assignedStats[task.assignedTo]++;
        }
    }
    
    // 生成统计HTML（显示左宇翔、彭逸、黑典、丁梦军、周玉）
    let statsHTML = '<div style="font-weight: bold; margin-bottom: 10px;">完成进度</div>';
    const userOrder = ['左宇翔', '彭逸', '黑典', '丁梦军', '周玉'];
    userOrder.forEach(user => {
        if (stats.hasOwnProperty(user)) {
            let line = `${user}: ${stats[user]}`;
            // 如果是可分配用户（左宇翔、彭逸、黑典），显示需完成数量（即使为0也要显示）
            if (assignedStats.hasOwnProperty(user)) {
                const assignedCount = assignedStats[user] || 0;
                line += `&nbsp;&nbsp;&nbsp;&nbsp;需完成：${assignedCount}`;
            }
            statsHTML += `<div>${line}</div>`;
        }
    });
    statsHTML += `<div style="font-weight: bold; margin-top: 10px;">总计: ${totalCompleted}/300</div>`;
    statsDiv.innerHTML = statsHTML;
}

// ==================== 彩蛋效果 ====================

// 礼花Canvas设置
const canvas = document.getElementById('confetti-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// 礼花粒子类
class ConfettiParticle {
    constructor(x, y, color, size = 'small') {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = size === 'large' ? Math.random() * 8 + 4 : Math.random() * 4 + 2;
        this.velocity = {
            x: (Math.random() - 0.5) * (size === 'large' ? 10 : 5),
            y: (Math.random() - 0.5) * (size === 'large' ? 10 : 5) - (size === 'large' ? 8 : 4)
        };
        this.gravity = size === 'large' ? 0.3 : 0.2;
        this.friction = 0.98;
        this.opacity = 1;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.2;
    }

    update() {
        this.velocity.y += this.gravity;
        this.velocity.x *= this.friction;
        this.velocity.y *= this.friction;
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.rotation += this.rotationSpeed;
        this.opacity -= 0.01;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.radius / 2, -this.radius / 2, this.radius, this.radius);
        ctx.restore();
    }
}

let confettiParticles = [];

// 动画循环
function animateConfetti() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    confettiParticles.forEach((particle, index) => {
        particle.update();
        particle.draw();
        
        if (particle.opacity <= 0) {
            confettiParticles.splice(index, 1);
        }
    });
    
    if (confettiParticles.length > 0) {
        requestAnimationFrame(animateConfetti);
    }
}

// 创建礼花效果
function createConfetti(x, y, count = 20, colors = null, size = 'small') {
    const defaultColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#F7DC6F', '#BB8FCE'];
    const confettiColors = colors || defaultColors;
    
    for (let i = 0; i < count; i++) {
        const color = confettiColors[Math.floor(Math.random() * confettiColors.length)];
        confettiParticles.push(new ConfettiParticle(x, y, color, size));
    }
    
    if (confettiParticles.length === count) {
        animateConfetti();
    }
}

// 全屏礼花
function createFullScreenConfetti(count = 100) {
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height * 0.5;
            createConfetti(x, y, 10, null, 'large');
        }, i * 30);
    }
}

// 显示里程碑提示
function showMilestone(message) {
    const popup = document.createElement('div');
    popup.className = 'milestone-popup';
    popup.textContent = message;
    document.body.appendChild(popup);
    
    setTimeout(() => {
        popup.remove();
    }, 2000);
}

// 获取格子在屏幕上的位置
function getTaskCellPosition(taskId) {
    const cell = document.querySelector(`[data-task-id="${taskId}"]`);
    if (cell) {
        const rect = cell.getBoundingClientRect();
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    }
    return { x: canvas.width / 2, y: canvas.height / 2 };
}

// 统计总完成数
function getTotalCompleted() {
    let count = 0;
    for (let i = 323; i <= 622; i++) {
        if (taskData[i] && taskData[i].completed) {
            count++;
        }
    }
    return count;
}

// 触发彩蛋效果
function triggerConfettiEffect(taskId, completedBy) {
    const pos = getTaskCellPosition(taskId);
    const userColor = users[completedBy]?.color || '#999';
    
    // 小礼花效果
    createConfetti(pos.x, pos.y, 15, [userColor, '#FFD700', '#FFF']);
    
    // 添加完成动画类
    const cell = document.querySelector(`[data-task-id="${taskId}"]`);
    if (cell) {
        cell.classList.add('just-completed');
        setTimeout(() => cell.classList.remove('just-completed'), 500);
    }
    
    // 检查里程碑
    setTimeout(() => {
        const totalCompleted = getTotalCompleted();
        
        // 每10个一个小庆祝
        if (totalCompleted % 10 === 0 && totalCompleted > 0) {
            createFullScreenConfetti(50);
            showMilestone(`🎉 已完成 ${totalCompleted}/300！`);
        }
        
        // 完成所有任务的超级庆祝
        if (totalCompleted === 300) {
            setTimeout(() => {
                createFullScreenConfetti(200);
                showMilestone('🎊 全部完成！太棒了！🎊');
            }, 500);
        }
        
        // 点击fake题目的特殊效果
        if (FAKE_TASKS.includes(parseInt(taskId))) {
            setTimeout(() => {
                showMilestone('😂 你完成了一道FAKE题！');
            }, 300);
        }
    }, 100);
}
