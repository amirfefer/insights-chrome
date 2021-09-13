import axios from 'axios';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { isBeta, getEnv, isFedRamp } from '../../../utils';
import { evaluateVisibility } from '../../../utils/isNavItemVisible';

export const requiredBundles = ['application-services', 'openshift', 'insights', ...(getEnv() !== 'prod' ? ['edge'] : []), 'ansible', 'settings'];
const bundlesOrder = ['application-services', 'openshift', 'rhel', 'edge', 'ansible', 'settings', 'cost-management', 'subscriptions'];

const isFedrampEnv = isFedRamp();

function getBundleLink({ title, isExternal, href, routes, expandable, ...rest }, modules) {
  const costLinks = [];
  const subscriptionsLinks = [];
  let url = href;
  let appId = rest.appId;
  let isFedramp = modules[appId]?.isFedramp;
  if (expandable) {
    routes.forEach(({ href, title, ...rest }) => {
      if (href.includes('/openshift/cost-management') && rest.filterable !== false) {
        costLinks.push({ ...rest, isFedramp: false, href, title });
      }

      if (rest.filterable !== false && (href.includes('/insights/subscriptions') || href.includes('/openshift/subscriptions'))) {
        subscriptionsLinks.push({
          ...rest,
          isFedramp: false, // openshift and subs are never visible on fedramp.
          href,
          title,
        });
      }

      if (!url && href.match(/^\//)) {
        url = isExternal ? href : href.split('/').slice(0, 3).join('/');
        appId = rest.appId ? rest.appId : appId;
        isFedramp = modules[appId]?.isFedramp;
      }
    });
  }

  return {
    ...rest,
    isFedramp,
    appId,
    isExternal,
    title,
    href: url,
    costLinks,
    subscriptionsLinks,
  };
}

const isDuplicate = (items, href) => !!items.find((item) => item.href === href);

const useAppFilter = () => {
  const isBetaEnv = isBeta();
  const [state, setState] = useState({
    isLoaded: false,
    isLoading: false,
    isOpen: false,
    filterValue: '',
    data: {
      'cost-management': {
        id: 'cost-management',
        title: 'Cost Management',
        links: [],
      },
      subscriptions: {
        id: 'subscriptions',
        title: 'Subscriptions',
        links: [],
      },
    },
  });
  const existingSchemas = useSelector(({ chrome: { navigation } }) => navigation);
  const modules = useSelector(({ chrome: { modules } }) => modules);

  const handleBundleData = async ({ data: { id, navItems, title } }) => {
    let links =
      navItems
        ?.reduce((acc, curr) => {
          if (curr.groupId) {
            return [...acc, ...curr.navItems?.map(({ groupId, navItems, ...rest }) => (groupId ? navItems : rest))];
          }
          return [...acc, curr];
        }, [])
        .flat()
        .map((link) => getBundleLink(link, modules))
        .filter(({ isFedramp }) => (isFedrampEnv ? !!isFedramp : true))
        .filter(({ filterable }) => filterable !== false) || [];
    const bundleLinks = [];
    const extraLinks = {
      cost: [],
      subs: [],
    };
    const promises = links.map(async ({ costLinks, subscriptionsLinks, ...rest }) => {
      const nextIndex = bundleLinks.length;
      if (costLinks.length > 0) {
        extraLinks.cost = await costLinks.filter(evaluateVisibility);
      }

      if (subscriptionsLinks.length > 0) {
        extraLinks.subs = await subscriptionsLinks.filter(evaluateVisibility);
      }
      if (rest.filterable !== true && (subscriptionsLinks.length > 0 || costLinks.length > 0)) {
        return;
      }

      /**
       * We have to create a placeholder for the link item, in order to preserver the links order
       */
      bundleLinks.push({ ...rest, isHidden: true });
      const link = await evaluateVisibility(rest);

      bundleLinks[nextIndex] = link;
    });
    await Promise.all(promises);

    setState((prev) => ({
      ...prev,
      isLoaded: true,
      data: {
        ...prev.data,
        [id]: {
          id,
          title,
          links: bundleLinks,
        },
        'cost-management': {
          ...prev.data['cost-management'],
          links: [
            ...prev.data['cost-management'].links,
            ...extraLinks.cost.filter((item) => !isDuplicate(prev.data['cost-management'].links, item.href)),
          ],
        },
        subscriptions: {
          ...prev.data.subscriptions,
          links: [...prev.data.subscriptions.links, ...extraLinks.subs.filter((item) => !isDuplicate(prev.data.subscriptions.links, item.href))],
        },
      },
    }));
  };

  useEffect(() => {
    if (state.isOpen && !state.isLoading && !state.isLoaded) {
      setState((prev) => ({
        ...prev,
        isLoading: true,
      }));
      let bundles = requiredBundles.filter((app) => !Object.keys(existingSchemas).includes(app));
      bundles.map((fragment) =>
        axios
          .get(`${isBetaEnv ? '/beta' : ''}/config/chrome/${fragment}-navigation.json`)
          .then(handleBundleData)
          .then(() => Object.values(existingSchemas).map((data) => handleBundleData({ data })))
          .catch((err) => {
            console.error('Unable to load appfilter bundle', err, fragment);
          })
      );
    }
  }, [state.isOpen]);

  const setIsOpen = (isOpen) => {
    setState((prev) => ({
      ...prev,
      isOpen,
    }));
  };
  const setFilterValue = (filterValue = '') => {
    setState((prev) => ({
      ...prev,
      filterValue,
    }));
  };

  const filterApps = (data, filterValue = '') =>
    Object.entries(data).reduce((acc, [key, { links, ...rest }]) => {
      if (rest?.title?.toLowerCase().includes(filterValue.toLowerCase())) {
        return {
          ...acc,
          [key]: {
            ...rest,
            links,
          },
        };
      }
      return {
        ...acc,
        [key]: {
          ...rest,
          links: links.filter(({ title, isHidden }) => !isHidden && title.toLowerCase().includes(filterValue.toLowerCase())),
        },
      };
    }, {});

  const filteredApps = filterApps(state.data, state.filterValue);
  return {
    ...state,
    setIsOpen,
    setFilterValue,
    filteredApps: bundlesOrder
      .map((app) => filteredApps[app])
      .filter((app) => typeof app !== 'undefined')
      .filter(({ links }) => links.length > 0),
  };
};

export default useAppFilter;
