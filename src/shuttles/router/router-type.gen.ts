import { Project, SourceFile, StructureKind } from 'ts-morph';
import { removeSync } from 'fs-extra';
import { RouterConfigResult } from './types';
import path from 'path';

const getFileSourceExportPageNameText = (fileSource: SourceFile) => {
  const exportPageNameStatement = fileSource.getExportSymbols().find((item) => {
    return item.getName() === 'pageName';
  });

  return (
    exportPageNameStatement?.getValueDeclaration()?.getType().getText() ??
    '"默认页面名"'
  ).slice(1, -1);
};

export const genRouterType = async (
  output: string,
  pageConfigList: RouterConfigResult[],
) => {
  const realOutputPath = path.resolve(output, 'router-type.ts');
  console.log(realOutputPath, 'realOutputPath');
  const project = new Project({});
  project.addSourceFilesAtPaths([
    ...(pageConfigList.map((v) => v.configPath).filter(Boolean) as string[]),
    '!node_modules',
  ]);
  project.resolveSourceFileDependencies();
  removeSync(realOutputPath);

  const routerTypeFile = project.createSourceFile(realOutputPath, {
    statements: [],
  });

  const pageTypeEnum = routerTypeFile.addEnum({
    name: 'PageType',
    isExported: true,
    members: [],
  });

  pageConfigList.forEach((item) => {
    let pageName = '默认页面名';
    // 生成 PageType 枚举
    if (item.pageType) {
      pageTypeEnum.addMember({
        name: item.pageType,
        value: item.pageType,
        docs: [
          {
            description: pageName,
            kind: StructureKind.JSDoc,
          },
        ],
      });
    }

    // 读取各个页面的配置文件，生成页面入参类型
    if (item.configPath && item.pageType) {
      const configSourceFile = project.getSourceFileOrThrow(item.configPath);
      const routerParamsInterface = configSourceFile.getInterface('PageParams');

      if (!routerParamsInterface) return;

      pageName = getFileSourceExportPageNameText(configSourceFile);

      routerTypeFile.addInterface({
        name: item.pageType,
        docs: [
          {
            tags: [
              {
                tagName: 'Page',
                text: pageName,
              },
            ],
          },
        ],
        properties: routerParamsInterface.getProperties().map((item) => {
          return {
            name: item.getName(),
            type: item.getTypeNode()?.getText(),
            docs: item.getJsDocs().map((doc) => {
              return {
                description: doc.getDescription(),
                tags: doc.getTags().map((tag) => {
                  return {
                    tagName: tag.getTagName(),
                    text: tag.getText(),
                  };
                }),
              };
            }),
          };
        }),
      });
    }
  });

  // 根据各个页面的入参类型生成路由参数映射
  const allPageInterfaces = routerTypeFile
    .getInterfaces()
    .filter((v) => v.getJsDocs()[0]?.getTags()[0]?.getTagName() === 'Page');

  routerTypeFile.addInterface({
    name: 'RouterParamsMapping',
    isExported: true,
    docs: [
      {
        description: '路由参数映射',
      },
    ],
    properties: allPageInterfaces.map((v) => {
      return {
        name: `[PageType.${v.getName()}]`,
        type: v.getName(),
      };
    }),
  });

  // asynchronously save all the changes above

  await project.save();
  routerTypeFile.formatText();
};
