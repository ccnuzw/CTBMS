import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Department, EntityStatus } from '@prisma/client';
import { CreateDepartmentDto, DepartmentTreeNode } from '@packages/types';
import { PrismaService } from '../../prisma';

@Injectable()
export class DepartmentService {
  constructor(private prisma: PrismaService) {}

  /**
   * 创建部门
   */
  async create(data: CreateDepartmentDto): Promise<Department> {
    // 验证所属组织存在性
    const org = await this.prisma.organization.findUnique({
      where: { id: data.organizationId },
    });
    if (!org) {
      throw new BadRequestException('所属组织不存在');
    }

    // 验证父部门存在性（如果指定）
    if (data.parentId) {
      const parent = await this.prisma.department.findUnique({
        where: { id: data.parentId },
      });
      if (!parent) {
        throw new BadRequestException('父部门不存在');
      }
      // 验证父部门属于同一组织
      if (parent.organizationId !== data.organizationId) {
        throw new BadRequestException('父部门必须属于同一组织');
      }
    }

    return this.prisma.department.create({
      data: {
        name: data.name,
        code: data.code,
        description: data.description ?? null,
        organizationId: data.organizationId,
        parentId: data.parentId ?? null,
        sortOrder: data.sortOrder ?? 0,
        status: (data.status as EntityStatus) ?? 'ACTIVE',
      },
    });
  }

  /**
   * 更新部门
   */
  async update(
    id: string,
    data: Partial<Omit<CreateDepartmentDto, 'organizationId'>>,
  ): Promise<Department> {
    const existing = await this.prisma.department.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('部门不存在');
    }

    // 防止循环引用
    if (data.parentId === id) {
      throw new BadRequestException('不能将部门设置为自己的子部门');
    }

    // 验证新的父部门不是当前部门的后代
    if (data.parentId) {
      const descendants = await this.findDescendantIds(id);
      if (descendants.includes(data.parentId)) {
        throw new BadRequestException('不能将部门移动到其下级部门下');
      }

      // 验证父部门属于同一组织
      const parent = await this.prisma.department.findUnique({
        where: { id: data.parentId },
      });
      if (parent && parent.organizationId !== existing.organizationId) {
        throw new BadRequestException('父部门必须属于同一组织');
      }
    }

    return this.prisma.department.update({
      where: { id },
      data: {
        name: data.name,
        code: data.code,
        description: data.description,
        parentId: data.parentId,
        sortOrder: data.sortOrder,
        status: data.status as EntityStatus | undefined,
      },
    });
  }

  /**
   * 获取某组织下的所有部门（扁平列表）
   */
  async findByOrganization(organizationId: string): Promise<Department[]> {
    return this.prisma.department.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        parent: true,
        _count: {
          select: { children: true },
        },
      },
    });
  }

  /**
   * 获取某组织下的部门树形结构
   */
  async findTree(organizationId: string): Promise<DepartmentTreeNode[]> {
    const allDepts = await this.prisma.department.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return this.buildTree(allDepts);
  }

  /**
   * 获取所有部门（扁平列表）
   */
  async findAll(): Promise<Department[]> {
    return this.prisma.department.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        organization: true,
        parent: true,
        _count: {
          select: { children: true },
        },
      },
    });
  }

  /**
   * 获取单个部门详情
   */
  async findOne(id: string): Promise<Department> {
    const dept = await this.prisma.department.findUnique({
      where: { id },
      include: {
        organization: true,
        parent: true,
        children: {
          orderBy: [{ sortOrder: 'asc' }],
        },
      },
    });

    if (!dept) {
      throw new NotFoundException('部门不存在');
    }

    return dept;
  }

  /**
   * 删除部门
   */
  async remove(id: string): Promise<Department> {
    const dept = await this.prisma.department.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!dept) {
      throw new NotFoundException('部门不存在');
    }

    // 检查是否有子部门
    const childrenCount = await this.prisma.department.count({
      where: { parentId: id },
    });

    if (childrenCount > 0) {
      throw new BadRequestException('该部门下存在子部门，无法删除');
    }

    return this.prisma.department.delete({
      where: { id },
    });
  }

  /**
   * 获取某部门的所有后代 ID
   */
  private async findDescendantIds(id: string): Promise<string[]> {
    const allNodes = await this.prisma.department.findMany({
      select: { id: true, parentId: true },
    });

    const childrenByParent = new Map<string, string[]>();
    for (const node of allNodes) {
      if (!node.parentId) continue;
      if (!childrenByParent.has(node.parentId)) {
        childrenByParent.set(node.parentId, []);
      }
      childrenByParent.get(node.parentId)!.push(node.id);
    }

    const descendants: string[] = [];
    const stack = [...(childrenByParent.get(id) || [])];

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      descendants.push(currentId);
      const children = childrenByParent.get(currentId);
      if (children?.length) {
        stack.push(...children);
      }
    }

    return descendants;
  }

  /**
   * 构建树形结构
   */
  private buildTree(depts: Department[]): DepartmentTreeNode[] {
    const deptMap = new Map<string, DepartmentTreeNode>();
    const roots: DepartmentTreeNode[] = [];

    // 先创建所有节点
    for (const dept of depts) {
      deptMap.set(dept.id, {
        id: dept.id,
        name: dept.name,
        code: dept.code,
        description: dept.description,
        organizationId: dept.organizationId,
        parentId: dept.parentId,
        sortOrder: dept.sortOrder,
        status: dept.status,
        children: [],
      });
    }

    // 构建层级关系
    for (const dept of depts) {
      const node = deptMap.get(dept.id)!;
      if (dept.parentId && deptMap.has(dept.parentId)) {
        deptMap.get(dept.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }
}
